# Source this to use the repo-local Android toolchain in .toolchain/ (nothing is installed outside this repository).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TOOLCHAIN="$REPO_ROOT/.toolchain"
export JAVA_HOME="$TOOLCHAIN/jdk"
export ANDROID_HOME="$TOOLCHAIN/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="$TOOLCHAIN/android-home"
export GRADLE_USER_HOME="$TOOLCHAIN/gradle"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
