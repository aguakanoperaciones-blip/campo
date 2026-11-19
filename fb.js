/* Conexión de las apps con Firestore (plan gratuito Spark), sin librerías externas.
   Usa la API REST de Firestore con la configuración de firebase-config.js. */
(function () {
  var C = window.FIREBASE_CONFIG || {};
  var listo = !!(C.apiKey && C.projectId && C.apiKey.indexOf("PEGA_") !== 0 && C.projectId.indexOf("PEGA_") !== 0);
  var BASE = (C.baseUrl || "https://firestore.googleapis.com/v1") + "/projects/" + C.projectId + "/databases/(default)/documents";

  // --- conversión entre objetos JS y el formato de Firestore ---
  function aValor(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
    if (typeof v === "object") return { mapValue: { fields: aCampos(v) } };
    return { stringValue: String(v) };
  }
  function aCampos(o) { var f = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined) f[k] = aValor(o[k]); }); return f; }
  function deValor(v) {
    if (!v) return null;
    if ("nullValue" in v) return null;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("stringValue" in v) return v.stringValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
    if ("mapValue" in v) return deCampos(v.mapValue.fields || {});
    return null;
  }
  function deCampos(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = deValor(f[k]); }); return o; }

  function pedir(metodo, url, cuerpo) {
    return fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "key=" + encodeURIComponent(C.apiKey), {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var m = (j && j.error && j.error.message) || ("error " + r.status);
          if (r.status === 403) m = "Firestore rechazó el acceso (revisa las reglas y la clave): " + m;
          throw new Error(m);
        }
        return j;
      });
    });
  }

  window.FB = {
    configurado: function () { return listo; },
    modoLocal: function () { return !listo; },
    set: function (col, id, doc) {
      if (!listo) return Promise.reject(new Error("Firebase no está configurado (firebase-config.js)"));
      var d = Object.assign({}, doc, { k: C.clave, recibido_en: new Date().toISOString() });
      return pedir("PATCH", BASE + "/" + col + "/" + encodeURIComponent(id), { fields: aCampos(d) });
    },
    listar: function (col, desde) {
      if (!listo) return Promise.resolve([]);
      var q = { structuredQuery: { from: [{ collectionId: col }] } };
      if (desde) q.structuredQuery.where = { fieldFilter: { field: { fieldPath: "fecha" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: desde } } };
      return pedir("POST", BASE + ":runQuery", q).then(function (filas) {
        return (filas || []).filter(function (x) { return x.document; }).map(function (x) {
          var o = deCampos(x.document.fields); delete o.k; return o;
        });
      });
    },
    foto: function (id) {
      return pedir("GET", BASE + "/fotos/" + encodeURIComponent(id)).then(function (d) { return deCampos(d.fields).b64; });
    },
    exportar: function () {
      return Promise.all(["capturas", "inspecciones", "pipas"].map(function (c) {
        return window.FB.listar(c).catch(function () { return []; });
      })).then(function (r) {
        return JSON.stringify({ origen: "firestore", generado: new Date().toISOString(), capturas: r[0], inspecciones: r[1], pipas: r[2] });
      });
    }
  };
})();
