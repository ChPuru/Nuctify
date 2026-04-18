# Contributing to Nuctify

Thank you for your interest in contributing to Nuctify. As an open-source music aggregator, we welcome contributions that improve the player engine, add new providers, or enhance the user experience across Web, Desktop, and Mobile.

## Development Workflow

1. Fork the repository and create your branch from `main`.
2. Install dependencies with `npm install`.
3. If you're adding a new provider, ensure it follows the interface defined in `src/providers/types.ts`.
4. Ensure your code is formatted and follows the existing architecture.

## Platform Specifics

- **Web**: Standard React development.
- **Desktop**: Requires Rust and the Tauri CLI.
- **Mobile**: Requires Android Studio and Capacitor sync.

## Community Standards

- Maintain a professional and respectful attitude.
- Focus on performance and accessibility.
- Avoid adding large external dependencies without prior discussion.

## Bug Reports

If you find a bug, please open an issue with:
- A clear description of the behavior.
- Steps to reproduce.
- Your platform (OS, Browser, Android version).

## Pull Request Process

- Ensure your build passes locally with `npm run build`.
- Update the documentation if you're introducing new features or environment variables.
- One of the maintainers will review your PR and provide feedback.
