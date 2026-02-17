<div align="center">
  <img src="public/assets/logo.png" alt="Vibriona Logo" width="120" height="120" />
  <h1>Vibriona</h1>
  <p><strong>AI-Powered Presentation Generator</strong> <br /> Transform ideas into professional slides in seconds.</p>
</div>

<div align="center">

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![GitHub Issues](https://img.shields.io/github/issues/KhanhNguyen9872/Vibriona.svg)](https://github.com/KhanhNguyen9872/Vibriona/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/KhanhNguyen9872/Vibriona.svg)](https://github.com/KhanhNguyen9872/Vibriona/pulls)

</div>

## 🌟 Introduction

**Vibriona** is a modern, AI-driven web application designed to streamline the process of creating presentation scripts and slides. By leveraging the power of Large Language Models (LLMs) like **Gemini**, **Ollama**, and **OpenAI**, Vibriona allows users to generate comprehensive presentation content, visual descriptions, and speaker notes simply by describing their topic.

Built with performance and user experience in mind, Vibriona features a sleek, responsive interface with real-time streaming, drag-and-drop slide management, and multi-format exports.

🔗 **Live Demo:** [vibriona.vercel.app](https://vibriona.vercel.app)

## ✨ Key Features

-   **🤖 Multi-LLM Support**: Seamlessly switch between **Gemini**, **Ollama** (local), and **OpenAI** (or compatible) APIs.
-   **💬 Interactive AI Chat**: Refine your presentation content through a conversational interface with context awareness.
-   **📝 Smart Script Generation**: Automatically generates slide titles, content, visual descriptions, and speaker notes.
-   **🎨 Slide Management**:
    -   **Drag & Drop**: Reorder slides effortlessly using `@dnd-kit`.
    -   **Layouts**: Choose from various layouts (Bullet points, Split view, Centered, etc.).
    -   **Editing**: Inline editing for all slide elements.
-   **📤 Export Options**:
    -   **PowerPoint (.pptx)**: Native editable PowerPoint files using `PptxGenJS`.
    -   **PDF**: High-quality document export via `@react-pdf/renderer`.
    -   **Markdown / JSON**: For developer flexibility.
-   **🌍 Internationalization**: Full support for **Vietnamese** and **English** (i18n).
-   **🌗 Dark/Light Mode**: Beautiful UI adaptable to your preference.
-   **📱 PWA Support**: Installable as a native-like app on mobile and desktop.
-   **🎙️ Voice Input**: Dictate your prompts for hands-free operation.

## 🛠️ Tech Stack

### Frontend Core
-   **[React 19](https://react.dev/)**: The latest version of the library for web and native user interfaces.
-   **[Vite](https://vitejs.dev/)**: Next Generation Frontend Tooling.
-   **[TypeScript](https://www.typescriptlang.org/)**: Typed JavaScript for better developer experience.

### Styling & UI
-   **[Tailwind CSS v4](https://tailwindcss.com/)**: A utility-first CSS framework (configured with `@tailwindcss/vite`).
-   **[Framer Motion](https://www.framer.com/motion/)**: Production-ready animation library for React.
-   **[Lucide React](https://lucide.dev/)**: Beautiful & consistent icons.
-   **[Sonner](https://sonner.emilkowal.ski/)**: An opinionated toast component for React.

### State Management
-   **[Zustand](https://github.com/pmndrs/zustand)**: A small, fast and scalable bearbones state-management solution.
-   **[Zundo](https://github.com/charkour/zundo)**: Undo/Redo middleware for Zustand.

### Utilities
-   **[i18next](https://www.i18next.com/)**: Internationalization framework.
-   **[PptxGenJS](https://gitbrent.github.io/PptxGenJS/)**: JavaScript library that creates PowerPoint presentations.
-   **[@react-pdf/renderer](https://react-pdf.org/)**: Create PDF files using React.
-   **[@dnd-kit](https://dndkit.com/)**: A lightweight, performant, accessible and extensible drag & drop toolkit for React.
-   **[React Markdown](https://github.com/remarkjs/react-markdown)**: Markdown rendering in React.

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites
-   **Node.js**: Version 18 or higher recommended.
-   **npm** or **yarn**.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/KhanhNguyen9872/Vibriona.git
    cd Vibriona
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Start the development server**:
    ```bash
    npm run dev
    ```

4.  **Open your browser**:
    Navigate to `http://localhost:5173` (or the port shown in your terminal).

## 📖 Usage

1.  **Configure API**: Click the **Settings** icon (bottom left) to select your AI text model provider.
    -   *Gemini*: Requires an API Key.
    -   *Ollama*: Ensure your local Ollama instance is running (default: `http://localhost:11434`).
    -   *OpenAI*: Enter your API Key and Endpoint.
2.  **Create a New Project**: Click "New Project" or start typing in the chat.
3.  **Generate Slides**: Describe your topic (e.g., "Create a 5-slide presentation about the future of AI").
4.  **Edit & Refine**: Use the slide panel (right side) to edit text, reorder slides, or change layouts.
5.  **Export**: Click the Export button to download your presentation as a `.pptx` or `.pdf` file.

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the Apache-2.0 License. See `LICENSE` for more information.

## ✍️ Author

**Nguyễn Văn Khánh** (KhanhNguyen9872)

-   GitHub: [@KhanhNguyen9872](https://github.com/KhanhNguyen9872)

---

<p align="center">Made with ❤️ using Vibriona</p>
