module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/pages/api/config.js [api] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>handler
]);
async function handler(req, res) {
    try {
        // Configuration depuis les variables d'environnement
        const INCUS_SERVER = process.env.INCUS_SERVER;
        const IP_PREFIX = process.env.IP_PREFIX;
        // Vérifier que les variables d'environnement sont définies
        if (!INCUS_SERVER || !IP_PREFIX) {
            const missingVars = [];
            if (!INCUS_SERVER) missingVars.push('INCUS_SERVER');
            if (!IP_PREFIX) missingVars.push('IP_PREFIX');
            console.error('Variables d\'environnement manquantes:', missingVars.join(', '));
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            res.status(500).json({
                error: 'Configuration incomplète',
                message: `Variables d'environnement manquantes: ${missingVars.join(', ')}. Veuillez créer un fichier .env avec les variables requises.`,
                missingVariables: missingVars
            });
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({
            incusServer: INCUS_SERVER,
            ipPrefix: IP_PREFIX
        });
    } catch (error) {
        console.error('Erreur dans /api/config:', error);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(500).json({
            error: 'Erreur lors de la récupération de la configuration',
            message: error.message
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__e1739d8c._.js.map