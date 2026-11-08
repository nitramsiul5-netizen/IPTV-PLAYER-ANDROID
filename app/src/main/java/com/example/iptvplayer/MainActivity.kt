package com.example.iptvplayer

import android.app.PictureInPictureParams
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.util.Base64
import android.util.Rational
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    
    // Layouts del reproductor
    private lateinit var rootLayout: FrameLayout
    lateinit var playerContainer: FrameLayout
    lateinit var playerOverlay: FrameLayout
    lateinit var touchCatcher: View

    // HUD para gestos de brillo y volumen
    private lateinit var gestureHud: LinearLayout
    private lateinit var txtGestureIcon: TextView
    private lateinit var txtGestureLabel: TextView
    private lateinit var barGesture: ProgressBar

    // Estado de visibilidad de controles sobre el video
    var isControlsVisible: Boolean = true

    // Elementos de la interfaz de control sobre la imagen (OSD Overlay)
    lateinit var txtTitle: TextView
    lateinit var txtSubtitle: TextView
    lateinit var btnPlayPause: Button
    lateinit var btnPrev: Button
    lateinit var btnNext: Button
    lateinit var btnBack: Button
    lateinit var btnChannelList: Button
    lateinit var badgeLive: TextView
    lateinit var btnAspectRatio: Button
    lateinit var btnPip: Button
    var vlcFloatBtn: Button? = null

    // Audio Manager para control de volumen
    private lateinit var audioManager: AudioManager
    private var maxVolume: Int = 15

    // Temporizador para auto-ocultar los controles del reproductor tras inactividad (5.5 segundos)
    private val hideHandler = Handler(Looper.getMainLooper())
    private val hideRunnable = Runnable { hideOverlay() }

    // Temporizador para ocultar el HUD de gestos
    private val hudHandler = Handler(Looper.getMainLooper())
    private val hudRunnable = Runnable {
        gestureHud.animate().alpha(0f).setDuration(250).withEndAction {
            gestureHud.visibility = View.GONE
        }.start()
    }

    // Opciones de formato de pantalla (Aspect Ratio)
    private var currentAspectIndex = 0
    private val aspectRatios = arrayOf(
        Pair("⛶ Ajustar", null),
        Pair("16:9", "16:9"),
        Pair("4:3", "4:3"),
        Pair("Zoom", "fill")
    )

    // ExoPlayer nativo
    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    var currentPlayingUrl: String? = null

    // LibVLC nativo
    var libVLC: org.videolan.libvlc.LibVLC? = null
    var vlcPlayer: org.videolan.libvlc.MediaPlayer? = null
    lateinit var vlcVideoLayout: org.videolan.libvlc.util.VLCVideoLayout

    // Control de doble pulsación para salir de la aplicación
    private var lastBackPressTime: Long = 0

    // Variables para seguimiento de gestos de brillo y volumen
    private var touchStartX = 0f
    private var touchStartY = 0f
    private var isGestureDragging = false
    private var isLeftControl = false // true: brillo (lado izq), false: volumen (lado der)
    private var initialVolume = 0
    private var initialBrightness = 0.5f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Forzar pantalla completa inmersiva
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        // Inicializar AudioManager
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)

        // 1. Layout raíz
        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // 2. WebView principal
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // 3. Contenedor del Reproductor Nativo y Controles
        playerContainer = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            visibility = View.GONE
        }

        // 3.1 VLC Video Layout
        vlcVideoLayout = org.videolan.libvlc.util.VLCVideoLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        playerContainer.addView(vlcVideoLayout)

        // 3.2 ExoPlayer PlayerView
        playerView = PlayerView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            visibility = View.GONE
            useController = false
        }
        playerContainer.addView(playerView)

        // 3.3 Touch Catcher: detector de toque de pantalla completa para reactivar el menú
        touchCatcher = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            isClickable = true
            isFocusable = false
            setOnClickListener {
                showOverlay()
            }
        }
        playerContainer.addView(touchCatcher)

        // 3.4 HUD Flotante para Gestos de Brillo y Volumen
        buildGestureHud()
        playerContainer.addView(gestureHud)

        // 3.5 Overlay de Controles y Menú sobre el video
        buildPlayerOverlay()
        playerContainer.addView(playerOverlay)

        // Añadir vistas principales al layout raíz
        rootLayout.addView(webView)
        rootLayout.addView(playerContainer)

        setContentView(rootLayout)

        // Inicializar componentes
        setupExoPlayer()
        setupLibVLC()
        setupWebView()
        setupBackNavigation()
    }

    private fun dpToPx(dp: Float): Int {
        return (dp * resources.displayMetrics.density).toInt()
    }

    private fun buildGestureHud() {
        val dm = resources.displayMetrics

        gestureHud = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                dpToPx(140f),
                dpToPx(110f)
            ).apply {
                gravity = Gravity.CENTER
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 18f * dm.density
                setColor(Color.parseColor("#D906040D"))
                setStroke(dpToPx(1.5f), Color.parseColor("#4A3F6B"))
            }
            setPadding(dpToPx(16f), dpToPx(12f), dpToPx(16f), dpToPx(12f))
            visibility = View.GONE
            elevation = 12f * dm.density
            isClickable = false
            isFocusable = false
        }

        txtGestureIcon = TextView(this).apply {
            text = "🔊"
            textSize = 28f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
        }
        gestureHud.addView(txtGestureIcon)

        txtGestureLabel = TextView(this).apply {
            text = "Volumen 50%"
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dpToPx(4f)
                bottomMargin = dpToPx(6f)
            }
        }
        gestureHud.addView(txtGestureLabel)

        barGesture = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 50
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(6f)
            )
            progressDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 3f * dm.density
                setColor(Color.parseColor("#00F2FE"))
            }
        }
        gestureHud.addView(barGesture)
    }

    private fun showGestureHud(icon: String, text: String, percent: Int) {
        hudHandler.removeCallbacks(hudRunnable)
        txtGestureIcon.text = icon
        txtGestureLabel.text = text
        barGesture.progress = percent
        if (gestureHud.visibility != View.VISIBLE || gestureHud.alpha < 1f) {
            gestureHud.visibility = View.VISIBLE
            gestureHud.alpha = 1f
        }
    }

    private fun hideGestureHudDelayed() {
        hudHandler.removeCallbacks(hudRunnable)
        hudHandler.postDelayed(hudRunnable, 1200)
    }

    private fun buildPlayerOverlay() {
        val dm = resources.displayMetrics

        playerOverlay = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            isClickable = true
            isFocusable = true
            setOnClickListener {
                hideOverlay()
            }
        }

        // --- BARRA SUPERIOR: Volver, Título del canal, Estado En Directo, Formato, PiP, VLC Ext ---
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.TOP
            }
            setPadding(dpToPx(16f), dpToPx(14f), dpToPx(16f), dpToPx(28f))
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.parseColor("#E606040D"), Color.TRANSPARENT)
            )
        }

        // Botón Volver a la Lista de Canales
        btnBack = Button(this).apply {
            text = "← Canales"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            setPadding(dpToPx(14f), dpToPx(8f), dpToPx(14f), dpToPx(8f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 20f * dm.density
                setColor(Color.parseColor("#80151026"))
                setStroke(dpToPx(1.2f), Color.parseColor("#4A3F6B"))
            }
            setOnClickListener {
                closeNativePlayer()
            }
        }
        topBar.addView(btnBack)

        // Información del Canal (Título y Subtítulo/Categoría)
        val infoLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dpToPx(14f)
                marginEnd = dpToPx(12f)
            }
        }

        txtTitle = TextView(this).apply {
            text = "AGTV LUIS"
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            setShadowLayer(6f, 0f, 2f, Color.BLACK)
        }
        infoLayout.addView(txtTitle)

        txtSubtitle = TextView(this).apply {
            text = "En directo"
            setTextColor(Color.parseColor("#00F2FE"))
            textSize = 12f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            setShadowLayer(4f, 0f, 1f, Color.BLACK)
        }
        infoLayout.addView(txtSubtitle)

        topBar.addView(infoLayout)

        // Badge "EN DIRECTO"
        badgeLive = TextView(this).apply {
            text = "● DIRECTO"
            setTextColor(Color.WHITE)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dpToPx(10f), dpToPx(4f), dpToPx(10f), dpToPx(4f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 12f * dm.density
                setColor(Color.parseColor("#E50914"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginEnd = dpToPx(8f)
            }
        }
        topBar.addView(badgeLive)

        // Botón Formato de Pantalla (Aspect Ratio)
        btnAspectRatio = Button(this).apply {
            text = "⛶ Ajustar"
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            setPadding(dpToPx(10f), dpToPx(6f), dpToPx(10f), dpToPx(6f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 16f * dm.density
                setColor(Color.parseColor("#80151026"))
                setStroke(dpToPx(1.2f), Color.parseColor("#6366F1"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginEnd = dpToPx(8f)
            }
            setOnClickListener {
                cycleAspectRatio()
            }
        }
        topBar.addView(btnAspectRatio)

        // Botón Modo Ventana Flotante (Picture-in-Picture)
        btnPip = Button(this).apply {
            text = "⧉ PiP"
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            setPadding(dpToPx(10f), dpToPx(6f), dpToPx(10f), dpToPx(6f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 16f * dm.density
                setColor(Color.parseColor("#804A3F6B"))
                setStroke(dpToPx(1.2f), Color.parseColor("#00F2FE"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginEnd = dpToPx(8f)
            }
            setOnClickListener {
                enterPipMode()
            }
        }
        topBar.addView(btnPip)

        // Botón rápido VLC externo
        val vlcBtn = Button(this).apply {
            text = "VLC ↗"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            setPadding(dpToPx(12f), dpToPx(6f), dpToPx(12f), dpToPx(6f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 16f * dm.density
                setColor(Color.parseColor("#FF8800"))
                setStroke(dpToPx(1.2f), Color.WHITE)
            }
            setOnClickListener {
                currentPlayingUrl?.let { url ->
                    closeNativePlayer()
                    webView.evaluateJavascript("javascript:AndroidBridge.playExternal('$url')", null)
                }
            }
        }
        vlcFloatBtn = vlcBtn
        topBar.addView(vlcBtn)

        playerOverlay.addView(topBar)

        // --- CONTROLES CENTRALES: Canal Anterior, Pausa/Play, Canal Siguiente ---
        val centerBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER
            }
        }

        // Botón Canal Anterior
        btnPrev = Button(this).apply {
            text = "⏮"
            textSize = 24f
            setTextColor(Color.WHITE)
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(dpToPx(56f), dpToPx(56f)).apply {
                marginEnd = dpToPx(24f)
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#99151026"))
                setStroke(dpToPx(1.5f), Color.parseColor("#8A2BE2"))
            }
            setOnClickListener {
                playPreviousChannel()
            }
        }
        centerBar.addView(btnPrev)

        // Botón Central Pausa / Reanudar
        btnPlayPause = Button(this).apply {
            text = "⏸"
            textSize = 28f
            setTextColor(Color.parseColor("#06040D"))
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(dpToPx(70f), dpToPx(70f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#00F2FE"))
                setStroke(dpToPx(2f), Color.WHITE)
            }
            elevation = 8f * dm.density
            setOnClickListener {
                togglePlayPause()
            }
        }
        centerBar.addView(btnPlayPause)

        // Botón Canal Siguiente
        btnNext = Button(this).apply {
            text = "⏭"
            textSize = 24f
            setTextColor(Color.WHITE)
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(dpToPx(56f), dpToPx(56f)).apply {
                marginStart = dpToPx(24f)
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#99151026"))
                setStroke(dpToPx(1.5f), Color.parseColor("#8A2BE2"))
            }
            setOnClickListener {
                playNextChannel()
            }
        }
        centerBar.addView(btnNext)

        playerOverlay.addView(centerBar)

        // --- BARRA INFERIOR: Botón Lista de Canales y Atajos ---
        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM
            }
            setPadding(dpToPx(16f), dpToPx(24f), dpToPx(16f), dpToPx(14f))
            background = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(Color.parseColor("#E606040D"), Color.TRANSPARENT)
            )
        }

        btnChannelList = Button(this).apply {
            text = "☰ Lista de Canales"
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            setPadding(dpToPx(14f), dpToPx(8f), dpToPx(14f), dpToPx(8f))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 16f * dm.density
                setColor(Color.parseColor("#991E163B"))
                setStroke(dpToPx(1.2f), Color.parseColor("#6366F1"))
            }
            setOnClickListener {
                closeNativePlayer()
            }
        }
        bottomBar.addView(btnChannelList)

        val txtHint = TextView(this).apply {
            text = "Desliza: Izq (Brillo) • Der (Volumen) | Toca para menú"
            setTextColor(Color.parseColor("#A09CB0"))
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dpToPx(16f)
            }
            setShadowLayer(4f, 0f, 1f, Color.BLACK)
        }
        bottomBar.addView(txtHint)

        playerOverlay.addView(bottomBar)
    }

    // Cambiar entre formatos de pantalla (Ajustar, 16:9, 4:3, Zoom)
    fun cycleAspectRatio() {
        resetHideTimer()
        currentAspectIndex = (currentAspectIndex + 1) % aspectRatios.size
        val selected = aspectRatios[currentAspectIndex]
        btnAspectRatio.text = selected.first

        try {
            if (selected.second == "fill") {
                vlcPlayer?.aspectRatio = null
                vlcPlayer?.scale = 0f
            } else {
                vlcPlayer?.scale = 1f
                vlcPlayer?.aspectRatio = selected.second
            }
            showGestureHud("⛶", selected.first, 100)
            hideGestureHudDelayed()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // Activar Modo Ventana Flotante (Picture-in-Picture)
    fun enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isNativePlayerActive()) {
            try {
                hideOverlay()
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .build()
                enterPictureInPictureMode(params)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } else {
            Toast.makeText(this, "Modo PiP no compatible con esta versión de Android", Toast.LENGTH_SHORT).show()
        }
    }

    // Activar automáticamente PiP al salir de la aplicación si el vídeo está reproduciéndose
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isNativePlayerActive()) {
            enterPipMode()
        }
    }

    // Adaptar interfaz al entrar o salir de Picture-in-Picture
    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        if (isInPictureInPictureMode) {
            playerOverlay.visibility = View.GONE
            touchCatcher.visibility = View.GONE
            gestureHud.visibility = View.GONE
            hideHandler.removeCallbacks(hideRunnable)
        } else {
            touchCatcher.visibility = View.VISIBLE
            if (isNativePlayerActive()) {
                showOverlay()
            }
        }
    }

    fun showOverlay() {
        hideHandler.removeCallbacks(hideRunnable)
        isControlsVisible = true
        playerOverlay.visibility = View.VISIBLE
        playerOverlay.animate()
            .alpha(1f)
            .setDuration(200)
            .start()
        hideHandler.postDelayed(hideRunnable, 5500)
    }

    fun hideOverlay() {
        hideHandler.removeCallbacks(hideRunnable)
        isControlsVisible = false
        playerOverlay.animate()
            .alpha(0f)
            .setDuration(250)
            .withEndAction {
                if (!isControlsVisible) {
                    playerOverlay.visibility = View.GONE
                }
            }
            .start()
    }

    fun toggleOverlay() {
        if (isControlsVisible && playerOverlay.visibility == View.VISIBLE && playerOverlay.alpha > 0.5f) {
            hideOverlay()
        } else {
            showOverlay()
        }
    }

    fun resetHideTimer() {
        hideHandler.removeCallbacks(hideRunnable)
        hideHandler.postDelayed(hideRunnable, 5500)
    }

    fun togglePlayPause() {
        resetHideTimer()
        try {
            if (vlcPlayer?.isPlaying == true) {
                vlcPlayer?.pause()
                btnPlayPause.text = "▶"
                hideHandler.removeCallbacks(hideRunnable)
            } else {
                vlcPlayer?.play()
                btnPlayPause.text = "⏸"
                resetHideTimer()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun playNextChannel() {
        resetHideTimer()
        showOverlay()
        runOnUiThread {
            webView.evaluateJavascript("javascript:if(window.playNextStream) window.playNextStream();", null)
        }
    }

    fun playPreviousChannel() {
        resetHideTimer()
        showOverlay()
        runOnUiThread {
            webView.evaluateJavascript("javascript:if(window.playPreviousStream) window.playPreviousStream();", null)
        }
    }

    fun isNativePlayerActive(): Boolean {
        return playerContainer.visibility == View.VISIBLE || 
               vlcVideoLayout.visibility == View.VISIBLE || 
               playerView.visibility == View.VISIBLE
    }

    fun closeNativePlayer() {
        hideHandler.removeCallbacks(hideRunnable)
        isControlsVisible = false

        // Detener ExoPlayer
        player?.stop()
        playerView.visibility = View.GONE

        // Detener LibVLC
        try {
            vlcPlayer?.stop()
            vlcPlayer?.detachViews()
        } catch (e: Exception) {
            e.printStackTrace()
        }

        playerOverlay.visibility = View.GONE
        vlcVideoLayout.visibility = View.GONE
        playerContainer.visibility = View.GONE

        webView.visibility = View.VISIBLE
        webView.requestFocus()

        // Permitir que la pantalla se apague normalmente tras salir del video
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        runOnUiThread {
            webView.evaluateJavascript("javascript:if(window.onPlayerClosed) window.onPlayerClosed();", null)
        }
    }

    private fun setupBackNavigation() {
        // Manejador del botón o gesto Atrás con Jetpack OnBackPressedDispatcher (Android 10 - 16+)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isNativePlayerActive()) {
                    closeNativePlayer()
                } else {
                    webView.evaluateJavascript("javascript:typeof handleAppBack === 'function' ? handleAppBack() : false") { result ->
                        val handled = result == "true"
                        if (!handled) {
                            if (webView.canGoBack()) {
                                webView.goBack()
                            } else {
                                handleExitConfirmation()
                            }
                        }
                    }
                }
            }
        })

        // Soporte adicional para Android 13+ (API 33+) Predictive Back Dispatcher
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) {
                if (isNativePlayerActive()) {
                    closeNativePlayer()
                } else {
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
    }

    private fun handleExitConfirmation() {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastBackPressTime < 2500) {
            finish()
        } else {
            lastBackPressTime = currentTime
            Toast.makeText(this, "Presiona Atrás de nuevo para salir", Toast.LENGTH_SHORT).show()
        }
    }

    // Intercepción de gestos táctiles (Brillo a la izquierda, Volumen a la derecha, Toque para menú)
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (isNativePlayerActive()) {
            val screenWidth = resources.displayMetrics.widthPixels
            val screenHeight = resources.displayMetrics.heightPixels

            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    touchStartX = ev.x
                    touchStartY = ev.y
                    isGestureDragging = false
                    isLeftControl = ev.x < (screenWidth / 2f)

                    initialVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                    val currentWinBrightness = window.attributes.screenBrightness
                    initialBrightness = if (currentWinBrightness < 0f) {
                        try {
                            android.provider.Settings.System.getInt(contentResolver, android.provider.Settings.System.SCREEN_BRIGHTNESS) / 255f
                        } catch (e: Exception) {
                            0.5f
                        }
                    } else {
                        currentWinBrightness
                    }

                    if (isControlsVisible) {
                        resetHideTimer()
                    }
                }

                MotionEvent.ACTION_MOVE -> {
                    val deltaY = touchStartY - ev.y // Hacia arriba = aumentar
                    val deltaX = Math.abs(ev.x - touchStartX)

                    // Umbral para activar el gesto de arrastre vertical
                    if (!isGestureDragging && Math.abs(deltaY) > dpToPx(18f) && Math.abs(deltaY) > deltaX) {
                        isGestureDragging = true
                    }

                    if (isGestureDragging) {
                        val percentChange = deltaY / (screenHeight * 0.70f)

                        if (isLeftControl) {
                            // Brillo (Lado izquierdo)
                            var newBrightness = initialBrightness + percentChange
                            newBrightness = Math.max(0.02f, Math.min(1.0f, newBrightness))
                            val lp = window.attributes
                            lp.screenBrightness = newBrightness
                            window.attributes = lp

                            val percent = (newBrightness * 100).toInt()
                            showGestureHud("🔆", "Brillo $percent%", percent)
                        } else {
                            // Volumen (Lado derecho)
                            val volumeChange = (percentChange * maxVolume).toInt()
                            var newVolume = initialVolume + volumeChange
                            newVolume = Math.max(0, Math.min(maxVolume, newVolume))
                            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, newVolume, 0)

                            val percent = ((newVolume.toFloat() / maxVolume) * 100).toInt()
                            val icon = if (newVolume == 0) "🔇" else if (percent < 50) "🔉" else "🔊"
                            showGestureHud(icon, "Volumen $percent%", percent)
                        }
                        return true
                    }
                }

                MotionEvent.ACTION_UP -> {
                    if (isGestureDragging) {
                        isGestureDragging = false
                        hideGestureHudDelayed()
                        return true // Consumir para no activar clics involuntarios tras deslizar
                    }

                    // Toque simple en pantalla
                    val diffX = Math.abs(ev.x - touchStartX)
                    val diffY = Math.abs(ev.y - touchStartY)
                    if (diffX < dpToPx(25f) && diffY < dpToPx(25f)) {
                        if (!isControlsVisible) {
                            showOverlay()
                            return true
                        }
                    }
                }

                MotionEvent.ACTION_CANCEL -> {
                    isGestureDragging = false
                    hideGestureHudDelayed()
                }
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    // Intercepción de teclas y mandos a distancia de TV
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_UP) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    if (isNativePlayerActive()) {
                        closeNativePlayer()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    if (isNativePlayerActive()) {
                        if (isControlsVisible) {
                            togglePlayPause()
                        } else {
                            showOverlay()
                        }
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_CHANNEL_UP -> {
                    if (isNativePlayerActive()) {
                        playNextChannel()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                    if (isNativePlayerActive()) {
                        playPreviousChannel()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (isNativePlayerActive()) {
                        showOverlay()
                        return true
                    }
                }
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                    if (isNativePlayerActive()) {
                        togglePlayPause()
                        return true
                    }
                }
                KeyEvent.KEYCODE_MEDIA_PLAY -> {
                    if (isNativePlayerActive()) {
                        vlcPlayer?.play()
                        btnPlayPause.text = "⏸"
                        resetHideTimer()
                        return true
                    }
                }
                KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                    if (isNativePlayerActive()) {
                        vlcPlayer?.pause()
                        btnPlayPause.text = "▶"
                        hideHandler.removeCallbacks(hideRunnable)
                        showOverlay()
                        return true
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    fun setupLibVLC() {
        try {
            val options = ArrayList<String>()
            options.add("-vvv")
            options.add("--http-reconnect")
            options.add("--network-caching=3000")
            
            libVLC = org.videolan.libvlc.LibVLC(this, options)
            vlcPlayer = org.videolan.libvlc.MediaPlayer(libVLC)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun setupExoPlayer() {
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("VLC/3.0.18 LibVLC/3.0.18")
            .setAllowCrossProtocolRedirects(true)

        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(httpDataSourceFactory)

        val renderersFactory = DefaultRenderersFactory(this)
            .setEnableDecoderFallback(true)

        player = ExoPlayer.Builder(this)
            .setRenderersFactory(renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .build()

        playerView.player = player
        
        player?.addListener(object : Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                error.printStackTrace()
                val errorMsg = error.localizedMessage ?: error.message ?: "Error desconocido de reproducción"
                runOnUiThread {
                    closeNativePlayer()
                    webView.evaluateJavascript("javascript:onPlaybackError('${errorMsg.replace("'", "\\'")}')", null)
                }
            }
        })
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.mediaPlaybackRequiresUserGesture = false

        // Registrar puente para JavaScript
        webView.addJavascriptInterface(WebAppInterface(this, webView, player, playerView), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }
        }

        webView.webChromeClient = WebChromeClient()

        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onPause() {
        super.onPause()
        // No pausar el vídeo si estamos entrando en Picture-in-Picture
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode) {
            return
        }
        player?.pause()
        try {
            vlcPlayer?.pause()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onStop() {
        super.onStop()
        // No detener el vídeo si estamos en Picture-in-Picture
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode) {
            return
        }
        player?.stop()
        try {
            vlcPlayer?.stop()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        hideHandler.removeCallbacks(hideRunnable)
        hudHandler.removeCallbacks(hudRunnable)
        player?.release()
        player = null
        
        try {
            vlcPlayer?.release()
            libVLC?.release()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        vlcPlayer = null
        libVLC = null
    }

    class WebAppInterface(
        private val activity: MainActivity, 
        private val webView: WebView,
        private val player: ExoPlayer?,
        private val playerView: PlayerView
    ) {
        
        @JavascriptInterface
        fun playNativeStream(url: String, title: String) {
            playNativeStreamFull(url, title, "")
        }

        @JavascriptInterface
        fun playNativeStreamFull(url: String, title: String, subtitle: String) {
            activity.runOnUiThread {
                try {
                    // Detener cualquier reproducción en curso
                    player?.stop()
                    try {
                        activity.vlcPlayer?.stop()
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }

                    // Ocultar WebView y mostrar reproductor
                    webView.visibility = View.GONE
                    activity.playerContainer.visibility = View.VISIBLE
                    activity.vlcVideoLayout.visibility = View.VISIBLE
                    activity.isControlsVisible = true
                    activity.playerOverlay.visibility = View.VISIBLE
                    activity.playerOverlay.alpha = 1f

                    // Actualizar textos del menú de control OSD
                    activity.txtTitle.text = title
                    activity.txtSubtitle.text = if (subtitle.isNotEmpty()) subtitle else "AGTV LUIS • Reproduciendo"
                    activity.btnPlayPause.text = "⏸"

                    // Mantener la pantalla encendida durante la reproducción
                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

                    // Inicializar LibVLC si es necesario
                    if (activity.libVLC == null || activity.vlcPlayer == null) {
                        activity.setupLibVLC()
                    }

                    // Vincular vistas de LibVLC
                    activity.vlcPlayer?.attachViews(activity.vlcVideoLayout, null, false, false)

                    // Cargar y reproducir el canal/película con LibVLC
                    val media = org.videolan.libvlc.Media(activity.libVLC, android.net.Uri.parse(url))
                    media.setHWDecoderEnabled(true, false) // Decodificación por hardware con fallback
                    activity.vlcPlayer?.media = media
                    media.release()
                    
                    activity.vlcPlayer?.play()
                    
                    activity.currentPlayingUrl = url
                    activity.showOverlay()
                } catch (e: Exception) {
                    e.printStackTrace()
                    webView.evaluateJavascript("alert('Error al reproducir canal con LibVLC: ${e.message}')", null)
                }
            }
        }

        @JavascriptInterface
        fun closeNativePlayer() {
            activity.runOnUiThread {
                activity.closeNativePlayer()
            }
        }

        @JavascriptInterface
        fun playExternal(url: String) {
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW)
            intent.setDataAndType(android.net.Uri.parse(url), "video/*")
            
            val chooser = android.content.Intent.createChooser(intent, "Reproducir con:")
            
            try {
                activity.startActivity(chooser)
            } catch (e: Exception) {
                activity.runOnUiThread {
                    webView.evaluateJavascript("javascript:showToast('No se encontró ningún reproductor de vídeo compatible.', 'error')", null)
                }
            }
        }

        @JavascriptInterface
        fun downloadFile(url: String, fileName: String) {
            activity.runOnUiThread {
                try {
                    val request = android.app.DownloadManager.Request(android.net.Uri.parse(url))
                    request.setTitle("AGTV Descarga: $fileName")
                    request.setDescription("Descargando contenido de AGTV LUIS...")
                    request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, "AGTV_LUIS/$fileName")
                    
                    val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
                    manager.enqueue(request)
                    
                    webView.evaluateJavascript("javascript:showToast('Descarga iniciada: $fileName', 'success')", null)
                } catch (e: Exception) {
                    e.printStackTrace()
                    webView.evaluateJavascript("javascript:showToast('Error al descargar: ${e.message}', 'error')", null)
                }
            }
        }

        @JavascriptInterface
        fun fetchUrl(url: String, callbackName: String) {
            Thread {
                var result = ""
                var connection: HttpURLConnection? = null
                try {
                    val urlObj = URL(url)
                    connection = urlObj.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 15000
                    connection.readTimeout = 15000
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                    
                    val responseCode = connection.responseCode
                    if (responseCode == HttpURLConnection.HTTP_OK) {
                        val reader = BufferedReader(InputStreamReader(connection.inputStream))
                        val stringBuilder = StringBuilder()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            stringBuilder.append(line).append("\n")
                        }
                        reader.close()
                        result = stringBuilder.toString()
                    } else {
                        result = "{\"error\": \"HTTP error $responseCode\"}"
                    }
                } catch (e: Exception) {
                    result = "{\"error\": \"Connection failed: ${e.message}\"}"
                } finally {
                    connection?.disconnect()
                }

                val finalResult = result
                activity.runOnUiThread {
                    try {
                        val encoded = Base64.encodeToString(finalResult.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
                        webView.evaluateJavascript("javascript:$callbackName(atob('$encoded'))", null)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }.start()
        }
    }
}
