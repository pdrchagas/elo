import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Sem StrictMode de proposito: o duplo-mount do dev atrapalha o ciclo
// de vida das conexoes WebRTC e do socket.
createRoot(document.getElementById('root')).render(<App />)
