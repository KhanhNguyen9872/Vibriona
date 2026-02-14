import { useState, useRef, useCallback, useEffect } from 'react'
import { API_CONFIG } from '../config/api'

interface SpeechResultItem {
  isFinal: boolean
  0: { transcript: string }
  length?: number
}
interface SpeechRecognitionResultEvent {
  resultIndex: number
  results: SpeechResultItem[]
}
type SpeechRecognitionCtor = new () => {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

const getSpeechRecognition = (): SpeechRecognitionCtor | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
const SpeechRecognition = getSpeechRecognition()

function langForSpeech(locale: string): string {
  const map: Record<string, string> = {
    en: 'en-US',
    vi: 'vi-VN',
  }
  return map[locale] ?? locale ?? 'en-US'
}

export function useSpeechRecognition(
  locale: string,
  onFinalTranscript: (text: string) => void,
  onInterimTranscript?: (text: string) => void
) {
  const BANDS = 8
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioLevels, setAudioLevels] = useState<number[]>(() => Array(BANDS).fill(0))
  const recognitionRef = useRef<InstanceType<NonNullable<typeof SpeechRecognition>> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const lastSpeechTimeRef = useRef(0)

  const isSupported = typeof window !== 'undefined' && !!SpeechRecognition

  const stopMicLevel = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
    setAudioLevels(Array(BANDS).fill(0))
  }, [])

  const stop = useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      try {
        rec.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
    stopMicLevel()
    setIsListening(false)
    setError(null)
  }, [stopMicLevel])

  const start = useCallback(() => {
    if (!SpeechRecognition || !isSupported) return
    stop()
    const rec = new SpeechRecognition()
    recognitionRef.current = rec
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langForSpeech(locale)

    rec.onresult = (event: SpeechRecognitionResultEvent) => {
      lastSpeechTimeRef.current = Date.now()
      let finalBuffer = ''
      let interimBuffer = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript.trim()
        if (!text) continue
        if (result.isFinal) {
          finalBuffer += (finalBuffer ? ' ' : '') + text
        } else {
          interimBuffer += (interimBuffer ? ' ' : '') + text
        }
      }
      if (finalBuffer) onFinalTranscript(finalBuffer)
      if (onInterimTranscript) onInterimTranscript(interimBuffer)
    }

    rec.onend = () => {
      recognitionRef.current = null
      setIsListening(false)
    }

    rec.onerror = (event: { error: string }) => {
      const err = event.error
      if (err === 'no-speech' || err === 'aborted') {
        setError(null)
        return
      }
      setError(err === 'not-allowed' ? 'Permission denied' : err)
      setIsListening(false)
      recognitionRef.current = null
    }

    try {
      rec.start()
      lastSpeechTimeRef.current = Date.now()
      setIsListening(true)
      setError(null)
      stopMicLevel()
      // Start mic level visualization (optional; may fail if mic already in use by recognition)
      navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
        streamRef.current = stream
        const ctx = new AudioContext()
        audioContextRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.4
        src.connect(analyser)
        analyserRef.current = analyser
        const bufLen = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufLen)

        const numBins = dataArray.length
        const binsPerBand = Math.max(1, Math.floor(numBins / BANDS))
        const tick = () => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          const raw: number[] = []
          let total = 0
          for (let b = 0; b < BANDS; b++) {
            const start = b * binsPerBand
            const end = b < BANDS - 1 ? start + binsPerBand : numBins
            let sum = 0
            for (let i = start; i < end; i++) sum += dataArray[i]
            const avg = sum / (end - start)
            total += avg
            raw.push(avg)
          }
          const maxRaw = Math.max(...raw, 1)
          const overall = total / (BANDS * 40)
          const scale = Math.min(1, Math.max(0, overall))
          const next = raw.map((v) => {
            const normalized = v / maxRaw
            const withFloor = Math.max(0.35, normalized)
            return Math.min(1, withFloor * scale * 1.2)
          })
          setAudioLevels(next)
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      }).catch(() => { /* ignore: mic may be used by recognition */ })
    } catch (e) {
      setError('Failed to start')
      setIsListening(false)
    }
  }, [isSupported, locale, onFinalTranscript, stop, stopMicLevel])

  useEffect(() => {
    if (!isListening) stopMicLevel()
    return () => stopMicLevel()
  }, [isListening, stopMicLevel])

  // Auto-stop after 4s of no speech (no result events)
  useEffect(() => {
    if (!isListening) return
    const id = setInterval(() => {
      if (Date.now() - lastSpeechTimeRef.current >= API_CONFIG.VOICE_SILENCE_AUTO_STOP_MS) {
        stop()
      }
    }, 500)
    return () => clearInterval(id)
  }, [isListening, stop])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  return { isListening, isSupported, error, audioLevels, start, stop, toggle }
}
