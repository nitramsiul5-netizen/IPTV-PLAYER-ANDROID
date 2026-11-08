# 📺 IPTV Player Android

Un reproductor multimedia IPTV moderno, rápido y de código abierto para Android, optimizado tanto para teléfonos como para Smart TVs / TV Boxes. Compatible con la API de **Xtream Codes** y **Listas M3U / M3U8**.

---

## ✨ Características Principales

- **Reproducción Nativa Ultra Rápida:** Motor LibVLC de alto rendimiento compatible con MPEG-TS, HLS, codecs de audio Dolby (AC3) y aceleración por hardware.
- **Controles Táctiles y OSD en Pantalla:**
  - Menú flotante sobre la imagen con Play/Pausa, cambio rápido de canal (Siguiente/Anterior).
  - Temporizador inteligente de auto-ocultado y reactivación táctil instantánea.
- **Gestos Táctiles Avanzados (Estilo MX Player / VLC):**
  - Deslizar en el lateral izquierdo para ajustar el **Brillo**.
  - Deslizar en el lateral derecho para ajustar el **Volumen**.
  - Indicador HUD visual translúcido en pantalla.
- **Formato de Pantalla (Aspect Ratio):** Alterna al vuelo entre *Ajustar*, *16:9*, *4:3* y *Zoom* sin cortes en la reproducción.
- **Modo Ventana Flotante (Picture-in-Picture / PiP):** Continúa viendo tu canal favorito en una ventana pequeña flotante mientras usas otras apps en el móvil.
- **Compatibilidad con Mandos de TV (D-Pad):** Totalmente operable mediante flechas de control remoto, botón OK y retroceso seguro.
- **Historial y Favoritos:** Acceso rápido a canales reproducidos recientemente y gestión de favoritos.
- **Modo Oscuro Puro AMOLED:** Para ahorrar batería en pantallas OLED/AMOLED.
- **Aviso Legal:** Esta aplicación no contiene ni proporciona ningún contenido multimedia. Los usuarios deben suministrar sus propias listas o accesos conformes a la legalidad vigente.

---

## 🛠️ Tecnologías y Requisitos

- **Lenguaje:** Kotlin + Jetpack Components / WebApp Bridge
- **Motor de Vídeo:** LibVLC Android (`org.videolan.android:libvlc-all:3.6.5`) + ExoPlayer fallback
- **Min SDK:** Android 7.0 (API 24)
- **Target SDK:** Android 16 (API 36)

---

## 🚀 Compilación e Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/nitramsiul5-netizen/IPTV-PLAYER-ANDROID.git
   ```
2. Ábrelo en **Android Studio**.
3. Compila el APK desde el terminal:
   ```bash
   ./gradlew assembleDebug
   ```
   El APK resultante estará en `app/build/outputs/apk/debug/app-debug.apk`.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **Apache 2.0**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
