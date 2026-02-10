#!/bin/bash
# Build script for Supertonic TTS Service
# Creates standalone executables for Linux x86_64 and ARM64
#
# Usage:
#   ./scripts/build.sh              # Build for current architecture only
#   ./scripts/build.sh all          # Build for all architectures (cross-compile)
#   ./scripts/build.sh x86_64       # Build for Linux x86_64 only
#   ./scripts/build.sh arm64        # Build for Linux ARM64 only
#
# Note: Bun supports cross-compilation, so you can build ARM64 on x86_64 and vice versa

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
    "all")
        echo "Building for ALL architectures (cross-compilation)..."
        build_target "bun-linux-x64" "linux-x86_64"
        build_target "bun-linux-arm64" "linux-arm64"
        ;;
    "x86_64"|"x64")
        echo "Building for Linux x86_64 only..."
        build_target "bun-linux-x64" "linux-x86_64"
        ;;
    "arm64"|"aarch64")
        echo "Building for Linux ARM64 only..."
        build_target "bun-linux-arm64" "linux-arm64"
        ;;
    "current"|*)
        echo "Building for CURRENT architecture only (${CURRENT_ARCH})..."
        case $CURRENT_ARCH in
            x86_64|amd64)
                build_target "bun-linux-x64" "linux-x86_64"
                ;;
            aarch64|arm64)
                build_target "bun-linux-arm64" "linux-arm64"
                ;;
            *)
                echo -e "${RED}Unsupported architecture: ${CURRENT_ARCH}${NC}"
                exit 1
                ;;
        esac
        ;;
esac

# Also build the client example
echo ""
echo -e "${YELLOW}Building client example...${NC}"
bun build ./examples/client.ts \
    --compile \
    --target=bun-linux-x64 \
    --outfile=${BUILD_DIR}/supertonic-client-linux-x86_64

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Successfully built client${NC}"
fi

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

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64|amd64)
        BINARY="${SCRIPT_DIR}/supertonic-linux-x86_64"
        ;;
    aarch64|arm64)
        BINARY="${SCRIPT_DIR}/supertonic-linux-arm64"
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
