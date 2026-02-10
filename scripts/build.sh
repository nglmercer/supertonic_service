#!/bin/bash
# Build script for Supertonic TTS Service
# Creates standalone executables for Linux x86_64 and ARM64
#
# Usage:
#   ./scripts/build.sh              # Build for current architecture only
#   ./scripts/build.sh all          # Build for all architectures (cross-compile)
#   ./scripts/build.sh x86_64       # Build for Linux x86_64 only
#   ./scripts/build.sh arm64        # Build for Linux ARM64 only
#   ./scripts/build.sh docker       # Build Docker image (recommended for ARM64)
#
# Note: For ARM64, Docker deployment is recommended due to native module dependencies.
# The standalone binary requires LD_LIBRARY_PATH to be set correctly.

set -e

echo "============================================================"
echo "Supertonic TTS Build Script"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Build directory
BUILD_DIR="./dist"
VERSION=${VERSION:-"1.0.0"}

# Parse arguments
BUILD_MODE=${1:-"current"}

# Clean previous builds
echo -e "${YELLOW}Cleaning previous builds...${NC}"
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR

# Function to build for a specific target
build_target() {
    local TARGET=$1
    local ARCH=$2
    local OUTPUT_NAME="supertonic-${ARCH}"
    
    echo ""
    echo -e "${YELLOW}Building for ${TARGET} (${ARCH})...${NC}"
    
    # Build the executable using Bun
    # Note: Bun supports cross-compilation via --target flag
    bun build ./src/server.ts \
        --compile \
        --target=${TARGET} \
        --outfile=${BUILD_DIR}/${OUTPUT_NAME}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully built ${OUTPUT_NAME}${NC}"
        
        # Get file size
        SIZE=$(ls -lh ${BUILD_DIR}/${OUTPUT_NAME} | awk '{print $5}')
        echo -e "  Size: ${SIZE}"
    else
        echo -e "${RED}✗ Failed to build ${OUTPUT_NAME}${NC}"
        return 1
    fi
}

# Function to build client
build_client() {
    local TARGET=$1
    local ARCH=$2
    local OUTPUT_NAME="supertonic-client-${ARCH}"
    
    echo ""
    echo -e "${YELLOW}Building client for ${TARGET} (${ARCH})...${NC}"
    
    bun build ./examples/client.ts \
        --compile \
        --target=${TARGET} \
        --outfile=${BUILD_DIR}/${OUTPUT_NAME}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully built ${OUTPUT_NAME}${NC}"
    fi
}

# Function to build Docker image
build_docker() {
    echo ""
    echo -e "${YELLOW}Building Docker image...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not installed. Please install Docker first.${NC}"
        exit 1
    fi
    
    # Build for current platform
    docker build -t supertonic:${VERSION} -t supertonic:latest .
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Docker image built successfully${NC}"
        echo ""
        echo "Run with:"
        echo "  docker run -p 3000:3000 supertonic:latest"
    else
        echo -e "${RED}✗ Failed to build Docker image${NC}"
        return 1
    fi
}

# Function to build multi-platform Docker image
build_docker_multiarch() {
    echo ""
    echo -e "${YELLOW}Building multi-platform Docker image (x86_64 and ARM64)...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not installed. Please install Docker first.${NC}"
        exit 1
    fi
    
    # Check for buildx
    if ! docker buildx version &> /dev/null; then
        echo -e "${RED}Docker buildx not available. Please install docker-buildx.${NC}"
        exit 1
    fi
    
    # Create builder if not exists
    docker buildx create --name multiarch --driver docker-container --use 2>/dev/null || true
    
    # Build and push (requires registry)
    echo "Note: Multi-platform builds require pushing to a registry."
    echo "Set REGISTRY environment variable to specify target registry."
    echo ""
    echo "Example:"
    echo "  REGISTRY=ghcr.io/yourusername ./scripts/build.sh docker-multi"
}

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: bun is not installed${NC}"
    echo "Please install bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Detect current architecture
CURRENT_ARCH=$(uname -m)
echo -e "${YELLOW}Current architecture: ${CURRENT_ARCH}${NC}"
echo -e "${YELLOW}Bun version: $(bun --version)${NC}"
echo -e "${YELLOW}Build mode: ${BUILD_MODE}${NC}"
echo ""

# Build based on mode
case $BUILD_MODE in
    "docker")
        build_docker
        exit 0
        ;;
    "docker-multi")
        build_docker_multiarch
        exit 0
        ;;
    "all")
        echo "Building for ALL architectures (cross-compilation)..."
        echo -e "${YELLOW}Note: Standalone binaries require native libraries at runtime.${NC}"
        echo -e "${YELLOW}For ARM64 deployment, Docker is recommended.${NC}"
        build_target "bun-linux-x64" "linux-x86_64"
        build_target "bun-linux-arm64" "linux-arm64"
        build_client "bun-linux-x64" "linux-x86_64"
        build_client "bun-linux-arm64" "linux-arm64"
        ;;
    "x86_64"|"x64")
        echo "Building for Linux x86_64 only..."
        build_target "bun-linux-x64" "linux-x86_64"
        build_client "bun-linux-x64" "linux-x86_64"
        ;;
    "arm64"|"aarch64")
        echo "Building for Linux ARM64 only..."
        echo -e "${YELLOW}Note: For ARM64, Docker deployment is recommended.${NC}"
        build_target "bun-linux-arm64" "linux-arm64"
        build_client "bun-linux-arm64" "linux-arm64"
        ;;
    "current"|*)
        echo "Building for CURRENT architecture only (${CURRENT_ARCH})..."
        case $CURRENT_ARCH in
            x86_64|amd64)
                build_target "bun-linux-x64" "linux-x86_64"
                build_client "bun-linux-x64" "linux-x86_64"
                ;;
            aarch64|arm64)
                build_target "bun-linux-arm64" "linux-arm64"
                build_client "bun-linux-arm64" "linux-arm64"
                ;;
            *)
                echo -e "${RED}Unsupported architecture: ${CURRENT_ARCH}${NC}"
                exit 1
                ;;
        esac
        ;;
esac

# Copy native libraries for each architecture
echo ""
echo -e "${YELLOW}Copying native libraries...${NC}"

# Copy x86_64 libraries
mkdir -p ${BUILD_DIR}/lib/x64
# ONNX Runtime
if [ -d "node_modules/onnxruntime-node/bin/napi-v3/linux/x64" ]; then
    cp node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*.so* ${BUILD_DIR}/lib/x64/ 2>/dev/null || true
    cp node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*.node ${BUILD_DIR}/lib/x64/ 2>/dev/null || true
fi
echo -e "${GREEN}✓ Copied x86_64 native libraries${NC}"

# Copy ARM64 libraries
mkdir -p ${BUILD_DIR}/lib/arm64
# ONNX Runtime
if [ -d "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64" ]; then
    cp node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/*.so* ${BUILD_DIR}/lib/arm64/ 2>/dev/null || true
    cp node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/*.node ${BUILD_DIR}/lib/arm64/ 2>/dev/null || true
fi
echo -e "${GREEN}✓ Copied ARM64 native libraries${NC}"

# Create a startup script
echo ""
echo -e "${YELLOW}Creating startup script...${NC}"
cat > ${BUILD_DIR}/start.sh << 'EOF'
#!/bin/bash
# Supertonic TTS Service Startup Script

# Default configuration
export PORT=${PORT:-3000}
export HOST=${HOST:-0.0.0.0}
export TTS_OUTPUT_DIR=${TTS_OUTPUT_DIR:-./output}
export TTS_DEFAULT_VOICE=${TTS_DEFAULT_VOICE:-F1}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect architecture and set library path
ARCH=$(uname -m)
case $ARCH in
    x86_64|amd64)
        BINARY="${SCRIPT_DIR}/supertonic-linux-x86_64"
        LIB_DIR="${SCRIPT_DIR}/lib/x64"
        ;;
    aarch64|arm64)
        BINARY="${SCRIPT_DIR}/supertonic-linux-arm64"
        LIB_DIR="${SCRIPT_DIR}/lib/arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Check if binary exists
if [ ! -f "$BINARY" ]; then
    echo "Binary not found: $BINARY"
    exit 1
fi

# Set library path for ONNX Runtime native libraries
if [ -d "$LIB_DIR" ]; then
    export LD_LIBRARY_PATH="${LIB_DIR}:${LD_LIBRARY_PATH}"
    echo "Library path set to: $LIB_DIR"
fi

# Create output directory if it doesn't exist
mkdir -p $TTS_OUTPUT_DIR

# Start the server
echo "Starting Supertonic TTS Service..."
echo "Architecture: $ARCH"
echo "Binary: $BINARY"
exec "$BINARY"
EOF

chmod +x ${BUILD_DIR}/start.sh
echo -e "${GREEN}✓ Created start.sh${NC}"

# Create README for dist
cat > ${BUILD_DIR}/README.md << 'EOF'
# Supertonic TTS Service

## Quick Start

```bash
./start.sh
```

## Architecture Detection

The startup script automatically detects your architecture and runs the correct binary.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `TTS_OUTPUT_DIR` - Output directory for audio files (default: ./output)
- `TTS_DEFAULT_VOICE` - Default voice (default: F1)

## API Endpoints

- `POST /api/tts/synthesize` - Synthesize text to speech
- `POST /api/tts/synthesize-mixed` - Synthesize mixed-language text
- `GET /api/tts/voices` - Get available voices
- `GET /api/tts/health` - Health check

## Docker Deployment (Recommended for ARM64)

```bash
docker build -t supertonic .
docker run -p 3000:3000 supertonic
```

## Native Libraries

The `lib/` directory contains native libraries for ONNX Runtime.
If you encounter library loading errors, ensure `LD_LIBRARY_PATH` is set correctly.
EOF

echo -e "${GREEN}✓ Created README.md${NC}"

# Summary
echo ""
echo "============================================================"
echo -e "${GREEN}Build Complete!${NC}"
echo "============================================================"
echo ""
echo "Built files:"
ls -lh $BUILD_DIR/
echo ""
echo "Usage:"
echo "  cd dist"
echo "  ./start.sh"
echo ""
echo "Or run directly:"
echo "  ./dist/supertonic-linux-x86_64"
echo "  ./dist/supertonic-linux-arm64"
echo ""
echo -e "${YELLOW}Note: For ARM64 deployment, Docker is recommended:${NC}"
echo "  docker build -t supertonic ."
echo "  docker run -p 3000:3000 supertonic"
echo ""
