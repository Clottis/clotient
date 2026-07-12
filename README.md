# Clotient 🚀 (clottis-client)

Clotient is a lightweight, local-first, developer-focused REST API client built with **Tauri**, **Rust**, and **React + TypeScript**. It runs natively on the desktop, bypasses CORS using a Rust HTTP backend (`reqwest`), and stores all history, collections, and environment configurations locally in simple JSON files with zero external system dependencies.

---

## Key Features

- **No CORS Constraints**: All API requests are processed via Rust's `reqwest` crate, bypassing webview-browser CORS locks completely.
- **Postman Compatibility**: Easily import and export collections in Postman formats (v2.0 / v2.1).
- **Environment Variables**: Dynamically parse variables (e.g. `{{base_url}}`) in URLs, headers, and request bodies.
- **Custom Scripts**: Run pre-request and post-request scripts in a sandboxed execution context using the custom `cs` namespace (e.g. `cs.env.set()`, `cs.response.json()`).
- **Code Snippet Generators**: Instantly generate requests in cURL, Python (Requests/http.client), JavaScript (axios/fetch), and Rust (reqwest).
- **Embedded Storage**: Zero-dependency local JSON storage, utilizing your OS-native app config folder (`$APPCONFIG`).
- **Premium Dark Mode UI**: A highly responsive dark theme styled with Tailwind CSS, offering clean animations via Framer Motion.

---

## Technical Stack

- **Desktop Framework**: Tauri v2
- **Backend Core**: Rust & Tokio, Reqwest, Serde
- **Frontend Framework**: React 19 & TypeScript, Tailwind CSS v4, Lucide Icons, Framer Motion

---

## Download

**Website:** [clotient.clottis.net](https://clotient.clottis.net/) — includes a **Download for macOS** button linked to the latest GitHub Release DMG.

**Direct release:** [github.com/Clottis/clotient/releases/latest](https://github.com/Clottis/clotient/releases/latest)

---

## Setup and Build Instructions

You can run or compile Clotient either **locally** on your host system (requires Node.js & Rust) or inside a **Docker Container** (requires only Docker).

---

### Option A: Local Host Setup (Node.js & Rust)

#### 1. Install System Prerequisites

* **Linux (Debian/Ubuntu-based)**:
  Install the required compilation libraries for Tauri:
  ```bash
  sudo apt update
  sudo apt install -y \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libsoup2.4-dev \
    webkit2gtk-4.0 \
    libjavascriptcoregtk-4.0-dev \
    pkg-config
  ```

* **macOS**:
  1. Install Xcode Command Line Tools:
     ```bash
     xcode-select --install
     ```
  2. Install Homebrew (if not already installed) and setup Node.js & Rust:
     ```bash
     brew install node rustup-init
     rustup-init
     ```
     Follow the prompt to add cargo build paths to your shell profile.

* **Windows**:
  1. Download and install [Node.js](https://nodejs.org/).
  2. Download and install [Rustup](https://rustup.rs/).
  3. Install C++ Build Tools via the Visual Studio Installer (select the **Desktop development with C++** workload).
  *(Refer to [Tauri Prerequisites Guide](https://tauri.app/start/prerequisites/) for detailed visual steps).*

#### 2. Verify Toolchains
Ensure you have Node.js (v18+) and Rust (1.75+) installed:
```bash
node -v
cargo --version
```

#### 3. Run Development Server
```bash
# Clone the repository (if not already done)
cd clotient

# Install frontend node packages
npm install

# Start the Tauri development environment (hot-reloads code modifications)
npm run tauri dev
```

#### 4. Compile Production Package
```bash
npm run tauri build
```
The compiled Linux executable and `.deb` installers will be output inside the `src-tauri/target/release/bundle/` directory.

---

### Option B: Compilation via Docker (No local Node.js or Rust required)

If you do not have Rust or Node.js installed locally, you can compile Clotient inside a Docker container and copy the compiled native binaries to your host machine.

#### 1. Build the Docker Compiler Image
Run this from the `clotient/` root directory to compile the builder container:
```bash
docker build -t clotient-builder .
```

#### 2. Run Compiler with Volume Mount
Run the build inside the container. We map the current working directory to `/app` inside the container so the compiled outputs write back to your host filesystem:
```bash
docker run --rm -v $(pwd):/app clotient-builder
```

#### 3. Install / Run Locally on Host
Once the build completes, the native release artifacts are available on your host computer:
- **Executable**: `./src-tauri/target/release/clotient`
- **Debian Installer**: `src-tauri/target/release/bundle/deb/`

Install the Debian package directly via:
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb
```

---

## Folder Structure

- `src/` - React frontend workspace.
  - `components/` - Sidebar list, request panels, response tabs, code snippet screens.
  - `utils/` - Sandbox runner, environment resolver, code generator libraries, Postman JSON translators.
- `src-tauri/` - Rust Tauri backend configuration.
  - `src/main.rs` - Tauri Rust commands to dispatch HTTP requests and resolve paths.
  - `Cargo.toml` - Rust crate dependencies.

---

## Contributing

Please review our [CONTRIBUTING.md](./CONTRIBUTING.md) to understand project structures, commit standards, and workflow practices.

---

## License

Clotient is licensed under the [MIT License](./LICENSE).
