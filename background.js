// Case Counter Pro v2.0 - Service Worker (MV3) - Mejorado con Robustez

const SCRIPT_URL = "https://script.google.com/a/macros/mercadolibre.com.co/s/AKfycbzULOcaGcZYFEFj_VHXv_ZzyvToUmX1U-UqYr9mkINJJQ99ibpJ0oI46WhmcbcwSpzLJw/exec";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 segundo

// Sistema de reintentos mejorado
async function postToScriptWithRetry(path, payload, retries = 0) {
  try {
    console.log(`[CCP] Enviando a backend: ${path}`, payload);
    
    const res = await fetch(`${SCRIPT_URL}?path=${encodeURIComponent(path)}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
    
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok && retries < MAX_RETRIES) {
      console.warn(`[CCP] Error ${res.status}, reintentando (${retries + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return postToScriptWithRetry(path, payload, retries + 1);
    }
    
    console.log(`[CCP] Respuesta recibida:`, { ok: res.ok, status: res.status });
    return { ok: res.ok, status: res.status, data };
    
  } catch (err) {
    console.error(`[CCP] Error en intento ${retries + 1}:`, err);
    
    if (retries < MAX_RETRIES) {
      console.warn(`[CCP] Reintentando en ${RETRY_DELAY * (retries + 1)}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return postToScriptWithRetry(path, payload, retries + 1);
    }
    
    return { ok: false, status: 0, data: { error: String(err) } };
  }
}

// Función original mantenida para compatibilidad
async function postToScript(path, payload) {
  return postToScriptWithRetry(path, payload);
}

// Badge inteligente mejorado
function updateBadge(total, goalReached, primaryColor) {
  try {
    // Color del badge según estado
    const badgeColor = goalReached ? "#22c55e" : (primaryColor || "#1DBA8E");
    
    chrome.action.setBadgeText({
      text: total > 0 ? String(total) : ""
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: badgeColor
    });
    
    // Tooltip dinámico
    const tooltipText = goalReached 
      ? `Case Counter Pro - ¡Meta alcanzada! (${total} casos)`
      : `Case Counter Pro - ${total} casos registrados`;
      
    chrome.action.setTitle({ title: tooltipText });
    
    console.log(`[CCP] Badge actualizado: ${total} casos, ${goalReached ? 'meta alcanzada' : 'en progreso'}`);
    
  } catch (err) {
    console.error("[CCP] Error actualizando badge:", err);
  }
}

// Manejo de mensajes mejorado
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      console.log("[CCP] Mensaje recibido:", msg.type);
      
      if (msg.type === "SCRIPT:REGISTER_CASE") {
        const result = await postToScript("registerCase", msg.payload);
        sendResponse(result);
        
      } else if (msg.type === "SCRIPT:GET_RANKING") {
        const result = await postToScript("getRanking", msg.payload);
        sendResponse(result);
        
      } else if (msg.type === "SCRIPT:GET_LEADER") {
        const result = await postToScript("getLeaderView", msg.payload);
        sendResponse(result);
        
      } else if (msg.type === "UPDATE_BADGE") {
        // Nuevo: Actualización inteligente del badge
        const { total, goalReached, color } = msg;
        updateBadge(total || 0, goalReached || false, color);
        sendResponse({ ok: true });
        
      } else {
        console.warn("[CCP] Tipo de mensaje desconocido:", msg.type);
        sendResponse({ ok: false, status: 400, data: { error: "Unknown message type" }});
      }
      
    } catch (err) {
      console.error("[CCP] Error procesando mensaje:", err);
      sendResponse({ ok: false, status: 500, data: { error: String(err) }});
    }
  })();
  
  return true; // Indica respuesta asíncrona
});

// Manejo de errores globales
chrome.runtime.onStartup.addListener(() => {
  console.log("[CCP] Service Worker iniciado");
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    console.log("[CCP] Extensión actualizada a v2.0");
  }
});