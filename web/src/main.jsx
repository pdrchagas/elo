import { createRoot } from 'react-dom/client'
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/sora/800.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import App from './App.jsx'
import './styles.css'

// Sem StrictMode de proposito: o duplo-mount do dev atrapalha o ciclo
// de vida das conexoes WebRTC e do socket.
createRoot(document.getElementById('root')).render(<App />)
