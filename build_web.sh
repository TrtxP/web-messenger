#!/bin/bash
cd frontend
flutter build web --release --dart-define=API_URL=$1
echo "Build complete. Output: frontend/build/web/"
