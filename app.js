const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const mercadopago = require('mercadopago');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
 
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./uploads/productos')) fs.mkdirSync('./uploads/productos');
 
// ==========================================
// MULTER — FOTOS DE PERFIL
// ==========================================
const storagePerfil = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, `foto_${Date.now()}${path.extname(file.originalname)}`)
});
const uploadPerfil = multer({
    storage: storagePerfil,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/jpeg|jpg|png|webp/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Solo JPG, PNG o WEBP.'));
    }
});
 
// ==========================================
// MULTER — FOTOS DE PRODUCTOS
// ==========================================
const storageProducto = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/productos/'),
    filename: (req, file, cb) => cb(null, `prod_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const uploadProducto = multer({
    storage: storageProducto,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/jpeg|jpg|png|webp/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Solo JPG, PNG o WEBP.'));
    }
});
 
// ==========================================
// MERCADO PAGO — COMPATIBLE CON CUALQUIER VERSION SDK
// ==========================================
let preferenceClient;
let paymentClient;
 
try {
    // Intentar SDK v2 moderno (mercadopago >= 2.x)
    if (mercadopago.MercadoPagoConfig) {
        const { MercadoPagoConfig, Preference, Payment } = mercadopago;
        const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        preferenceClient = new Preference(mpClient);
        paymentClient    = new Payment(mpClient);
        console.log("💳 Mercado Pago SDK v2 (moderno) inicializado.");
    }
    // Fallback SDK v1 clásico (mercadopago < 2.x)
    else if (typeof mercadopago.configure === 'function') {
        mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });
        preferenceClient = {
            create: async (payload) => {
                const body = payload.body || payload;
                return await mercadopago.preferences.create(body);
            }
        };
        paymentClient = {
            get: async ({ id }) => {
                return await mercadopago.payment.findById(id);
            }
        };
        console.log("💳 Mercado Pago SDK v1 (clásico) inicializado.");
    } else {
        throw new Error("SDK de Mercado Pago no reconocido.");
    }
} catch (e) {
    console.error("❌ Error inicializando Mercado Pago:", e.message);
    // Crear clientes dummy para que el servidor no crashee
    preferenceClient = { create: async () => { throw new Error("MP no configurado"); } };
    paymentClient    = { get:    async () => { throw new Error("MP no configurado"); } };
}
 
// ==========================================
// NODEMAILER
// ==========================================
const transportador = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4, // <--- ESTO FUERZA IPV4 Y QUITA EL ERROR ESOCKET
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
});
// ==========================================
// MONGODB ATLAS
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("🍃 Conectado con éxito a MONGODB ATLAS ☁️"))
    .catch(err => console.error("❌ Error MongoDB Atlas:", err));
 
// ==========================================
// SCHEMAS & MODELOS
// ==========================================
const UsuarioSchema = new mongoose.Schema({
    nombre: String,
    apellido: String,
    fechaNacimiento: String,
    ciudad: String,
    correo: { type: String, unique: true, required: true },
    contraseña: String,
    telefono: String,
    teléfono: String,
    rol: { type: String, default: 'usuario' },
    membresia: { type: Boolean, default: false },
    fechaMembresia: { type: Date, default: null },
    cuentaConfirmada: { type: Boolean, default: false },
    tokenVerificacion: String,
    fotoPerfil: { type: String, default: '' },
    presentacion: { type: String, default: '' }
}, { strict: false });
 
const ProductoSchema = new mongoose.Schema({
    correoVendedor: String,
    nombreVendedor: String,
    fotoPerfilVendedor: String,
    titulo: String,
    categoria: String,
    subcategoria: String,
    estado: String,
    aprovechamiento: String,
    descripcion: String,
    precio: Number,
    ubicacion: String,
    marca: String, modelo: String, ram: String, procesador: String,
    almacenamiento: String, sistemaOperativo: String, pantalla: String,
    velocidad: String, puertos: String, capacidad: String, conectividad: String,
    contieneBateria: String, materialPredominante: String,
    riesgoAmbiental: String, pesoAproximado: String,
    imagenes: [String],
    likes: [String],
    guardadoPor: [String],
    fechaPublicacion: { type: Date, default: Date.now },
    activo: { type: Boolean, default: true }
});
 
const ServicioSchema = new mongoose.Schema({
    correoProveedor: String,
    nombreProveedor: String,
    fotoPerfilProveedor: String,
    nombreServicio: String,
    categoriaServicio: String,
    modalidad: String,
    tarifa: Number,
    horarios: String,
    certificaciones: String,
    descripcion: String,
    ubicacion: String,
    imagenServicio: String,
    likes: [String],
    guardadoPor: [String],
    fechaPublicacion: { type: Date, default: Date.now },
    activo: { type: Boolean, default: true }
});
 
const Usuario  = mongoose.model('Usuario',  UsuarioSchema,  'usuarios');
const Producto = mongoose.model('Producto', ProductoSchema, 'productos');
const Servicio = mongoose.model('Servicio', ServicioSchema, 'servicios');
 
// ==========================================
// VISTAS HTML
// ==========================================
app.get('/',                   (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login',              (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/registro.html',      (req, res) => res.sendFile(path.join(__dirname, 'registro.html')));
app.get('/confirmar.html',     (req, res) => res.sendFile(path.join(__dirname, 'confirmar.html')));
app.get('/panel_admin.html',   (req, res) => res.sendFile(path.join(__dirname, 'panel_admin.html')));
app.get('/panel_cliente.html', (req, res) => res.sendFile(path.join(__dirname, 'panel_cliente.html')));
app.get('/pago-exitoso.html',  (req, res) => res.sendFile(path.join(__dirname, 'pago-exitoso.html')));
 
// ==========================================
// API: LOGIN
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { correo, password } = req.body;
        if (!correo || !password) return res.status(400).json({ error: "Por favor, rellena todos los campos." });
 
        const correoLimpio = correo.toLowerCase().trim();
        const todos = await Usuario.find({});
        const usuarioFound = todos.find(u => (u.correo || '').toLowerCase().trim() === correoLimpio);
        if (!usuarioFound) return res.status(400).json({ error: "El correo electrónico no está registrado." });
 
        const datos = usuarioFound.toObject();
        if (datos.cuentaConfirmada === false)
            return res.status(401).json({ error: "Tu cuenta aún no está verificada.", requiereConfirmacion: true, correo: datos.correo });
 
        const passwordBD = datos.contraseña || datos.password;
        if (!passwordBD || passwordBD.trim() !== password.trim())
            return res.status(400).json({ error: "Contraseña incorrecta. Intenta de nuevo." });
 
        const rolNormalizado = (datos.rol === 'admin' || datos.rol === 'administrador') ? 'administrador' : 'usuario';
 
        let membresiaActiva = false;
        if (datos.membresia && datos.fechaMembresia) {
            const fv = new Date(datos.fechaMembresia);
            fv.setMonth(fv.getMonth() + 1);
            if (Date.now() <= fv.getTime()) membresiaActiva = true;
            else await Usuario.updateOne({ _id: usuarioFound._id }, { $set: { membresia: false } });
        }
 
        res.json({
            mensaje: "Acceso concedido",
            nombre: (datos.nombre || '').trim(),
            apellido: (datos.apellido || '').trim(),
            correo: (datos.correo || '').trim(),
            telefono: (datos.teléfono || datos.telefono || '').trim(),
            ciudad: (datos.ciudad || '').trim(),
            fechaNacimiento: (datos.fechaNacimiento || '').trim(),
            rol: rolNormalizado,
            membresia: membresiaActiva,
            fotoPerfil: datos.fotoPerfil || '',
            presentacion: datos.presentacion || ''
        });
    } catch (err) {
        console.error("❌ Error login:", err);
        res.status(500).json({ error: "Error interno en el inicio de sesión." });
    }
});
 
// ==========================================
// API: REGISTRO CON CORREO DE VERIFICACIÓN
// ==========================================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, apellidoPaterno, apellidoMaterno, fechaNacimiento, telefono, ciudad, correo, password } = req.body;
        const correoLimpio = correo.toLowerCase().trim();
 
        const existe = await Usuario.findOne({ correo: correoLimpio });
        if (existe) return res.status(400).json({ error: "El correo ya está registrado." });
 
        const codigo = Math.floor(10000 + Math.random() * 90000).toString();
        const CORREO_ADMIN = (process.env.EMAIL_USER || '').toLowerCase();
 
        const nuevoUsuario = new Usuario({
            nombre: nombre.trim(),
            apellido: `${apellidoPaterno.trim()} ${apellidoMaterno.trim()}`,
            fechaNacimiento: fechaNacimiento.trim(),
            teléfono: telefono.trim(),
            telefono: telefono.trim(),
            ciudad: ciudad.trim(),
            correo: correoLimpio,
            contraseña: password.trim(),
            rol: correoLimpio === CORREO_ADMIN ? 'administrador' : 'usuario',
            cuentaConfirmada: false,
            tokenVerificacion: codigo,
            membresia: false,
            fechaMembresia: null,
            fotoPerfil: '',
            presentacion: ''
        });
 
        await nuevoUsuario.save();
 
        try {
            const info = await transportador.sendMail({
                from: `"REBOOP" <${process.env.EMAIL_USER}>`,
                to: correoLimpio,
                subject: '🔑 Código de confirmación - REBOOP',
                html: `
                <div style="font-family:sans-serif;background:#1a2333;color:white;padding:30px;border-radius:10px;border-top:5px solid #2ecc71;max-width:500px;margin:auto;">
                    <h1 style="color:#2ecc71;text-align:center;letter-spacing:2px;">REBOOP</h1>
                    <p style="color:#b2bec3;">Ecosistema de Reciclaje Tecnológico — Región Norte de Veracruz</p>
                    <hr style="border-color:#2c3e50;">
                    <p style="margin-top:20px;">¡Hola <strong style="color:#fff;">${nombre}</strong>! Gracias por registrarte.</p>
                    <p style="color:#b2bec3;">Tu código de verificación de 5 dígitos es:</p>
                    <div style="background:#0f141c;text-align:center;padding:20px;margin:20px 0;border-radius:8px;border:1px solid #2ecc71;">
                        <span style="font-size:2.8rem;font-weight:bold;letter-spacing:10px;color:#f1c40f;">${codigo}</span>
                    </div>
                    <p style="color:#7f8c8d;font-size:0.85rem;">Ingresa este código en la pantalla de verificación para activar tu cuenta. Si no solicitaste este registro, ignora este mensaje.</p>
                </div>`
            });
            console.log("✅ Correo de verificación enviado:", info.messageId, "→", correoLimpio);
            res.json({ mensaje: "Usuario registrado. Código enviado al correo.", correo: correoLimpio });
        } catch (emailErr) {
            console.error("❌ ERROR AL ENVIAR CORREO:", emailErr.message);
            await Usuario.deleteOne({ correo: correoLimpio });
            res.status(500).json({ error: "No se pudo enviar el código de verificación. Verifica que el correo sea válido." });
        }
    } catch (err) {
        console.error("❌ Error registro:", err);
        res.status(500).json({ error: "Error interno en el proceso de registro." });
    }
});
 
// ==========================================
// API: CONFIRMAR CUENTA (CÓDIGO DE 5 DÍGITOS)
// ==========================================
app.post('/api/confirmar-cuenta', async (req, res) => {
    try {
        const { correo, codigo } = req.body;
        const correoLimpio = correo.toLowerCase().trim();
        const u = await Usuario.findOne({ correo: correoLimpio });
 
        if (!u) return res.status(404).json({ error: "Correo no encontrado." });
        if (u.cuentaConfirmada) return res.json({ mensaje: "La cuenta ya estaba confirmada. Puedes iniciar sesión." });
        if (u.tokenVerificacion !== codigo.trim())
            return res.status(400).json({ error: "Código incorrecto. Verifica los 5 dígitos e intenta de nuevo." });
 
        await Usuario.updateOne({ _id: u._id }, {
            $set: { cuentaConfirmada: true, tokenVerificacion: null }
        });
 
        console.log("✅ Cuenta confirmada:", correoLimpio);
        res.json({ mensaje: "¡Cuenta confirmada con éxito! Ya puedes iniciar sesión." });
    } catch (err) {
        console.error("❌ Error confirmar cuenta:", err);
        res.status(500).json({ error: "Error al validar el código." });
    }
});
 
// ==========================================
// API: EDITAR PERFIL
// ==========================================
app.post('/api/editar-perfil', async (req, res) => {
    try {
        const { correo, nombre, apellido, telefono, ciudad, presentacion } = req.body;
        const u = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
        if (!u) return res.status(404).json({ error: "Usuario no encontrado." });
 
        await Usuario.updateOne({ _id: u._id }, {
            $set: {
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                teléfono: telefono.trim(),
                telefono: telefono.trim(),
                ciudad: ciudad.trim(),
                presentacion: presentacion.trim()
            }
        });
 
        res.json({
            mensaje: "Perfil actualizado.",
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            telefono: telefono.trim(),
            ciudad: ciudad.trim(),
            presentacion: presentacion.trim()
        });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar los datos." });
    }
});
 
// ==========================================
// API: SUBIR FOTO DE PERFIL
// ==========================================
app.post('/api/subir-foto', uploadPerfil.single('foto'), async (req, res) => {
    try {
        const { correo } = req.body;
        if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen." });
        const urlFoto = `/uploads/${req.file.filename}`;
 
        const u = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
        if (!u) return res.status(404).json({ error: "Usuario no encontrado." });
 
        if (u.fotoPerfil) {
            const ruta = path.join(__dirname, u.fotoPerfil);
            if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
        }
        await Usuario.updateOne({ _id: u._id }, { $set: { fotoPerfil: urlFoto } });
        res.json({ mensaje: "Foto actualizada.", urlFoto });
    } catch (err) {
        res.status(500).json({ error: "Error al procesar la foto." });
    }
});
 
// ==========================================
// API: FEED UNIFICADO (INICIO - SOLO ACTIVOS)
// ==========================================
app.get('/api/inicio-feed', async (req, res) => {
    try {
        const { buscar, orden } = req.query;
        let queryProd = { activo: true };
        let queryServ = { activo: true };
 
        if (buscar) {
            const regex = new RegExp(buscar.trim(), 'i');
            queryProd.$or = [{ titulo: regex }, { descripcion: regex }, { marca: regex }, { categoria: regex }];
            queryServ.$or = [{ nombreServicio: regex }, { descripcion: regex }, { categoriaServicio: regex }];
        }
 
        const productos = await Producto.find(queryProd).lean();
        const servicios = await Servicio.find(queryServ).lean();
 
        let feedCompleto = [
            ...productos.map(p => ({ ...p, tipoElemento: 'producto' })),
            ...servicios.map(s => ({ ...s, tipoElemento: 'servicio' }))
        ];
 
        if (orden === 'baratos') feedCompleto.sort((a, b) => (a.precio || a.tarifa || 0) - (b.precio || b.tarifa || 0));
        else if (orden === 'pasadas') feedCompleto.sort((a, b) => new Date(a.fechaPublicacion) - new Date(b.fechaPublicacion));
        else feedCompleto.sort((a, b) => new Date(b.fechaPublicacion) - new Date(a.fechaPublicacion));
 
        res.json(feedCompleto);
    } catch (err) {
        res.status(500).json({ error: "Fallo al compilar feed." });
    }
});
 
// ==========================================
// API: MIS PUBLICACIONES (INCLUYE INACTIVAS)
// ==========================================
app.get('/api/mis-publicaciones', async (req, res) => {
    try {
        const { correo } = req.query;
        if (!correo) return res.status(400).json({ error: "Correo requerido." });
        const correoLimpio = correo.toLowerCase().trim();
 
        const productos = await Producto.find({ correoVendedor: correoLimpio }).lean();
        const servicios = await Servicio.find({ correoProveedor: correoLimpio }).lean();
 
        const todo = [
            ...productos.map(p => ({ ...p, tipoElemento: 'producto' })),
            ...servicios.map(s => ({ ...s, tipoElemento: 'servicio' }))
        ].sort((a, b) => new Date(b.fechaPublicacion) - new Date(a.fechaPublicacion));
 
        res.json(todo);
    } catch (err) {
        res.status(500).json({ error: "Error al cargar tus publicaciones." });
    }
});
 
// ==========================================
// API: PUBLICAR PRODUCTO
// ==========================================
app.post('/api/publicar-producto', uploadProducto.array('imagenes', 6), async (req, res) => {
    try {
        const { correo } = req.body;
        const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
 
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });
        if (!usuario.membresia) return res.status(403).json({ error: "Necesitas membresía activa para publicar." });
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "Debes subir al menos una imagen." });
 
        const imagenes = req.files.map(f => `/uploads/productos/${f.filename}`);
 
        await new Producto({
            correoVendedor: correo.toLowerCase().trim(),
            nombreVendedor: `${(usuario.nombre || '').trim()} ${(usuario.apellido || '').trim()}`.trim(),
            fotoPerfilVendedor: usuario.fotoPerfil || '',
            titulo: req.body.titulo, categoria: req.body.categoria, subcategoria: req.body.subcategoria,
            estado: req.body.estado, aprovechamiento: req.body.aprovechamiento,
            descripcion: req.body.descripcion, precio: parseFloat(req.body.precio) || 0,
            ubicacion: req.body.ubicacion, marca: req.body.marca || '', modelo: req.body.modelo || '',
            ram: req.body.ram || '', procesador: req.body.procesador || '',
            almacenamiento: req.body.almacenamiento || '', sistemaOperativo: req.body.sistemaOperativo || '',
            pantalla: req.body.pantalla || '', velocidad: req.body.velocidad || '',
            puertos: req.body.puertos || '', capacidad: req.body.capacidad || '',
            conectividad: req.body.conectividad || '', contieneBateria: req.body.contieneBateria || '',
            materialPredominante: req.body.materialPredominante || '',
            riesgoAmbiental: req.body.riesgoAmbiental || 'Bajo',
            pesoAproximado: req.body.pesoAproximado || '', imagenes
        }).save();
 
        res.json({ ok: true, mensaje: "¡Producto publicado con éxito en REBOOP!" });
    } catch (err) {
        console.error("❌ Error publicar producto:", err);
        res.status(500).json({ error: "Error interno al publicar el producto." });
    }
});
 
// ==========================================
// API: PUBLICAR SERVICIO
// ==========================================
app.post('/api/publicar-servicio', async (req, res) => {
    try {
        const { correo, nombreServicio, categoriaServicio, modalidad, tarifa, horarios, certificaciones, descripcion, ubicacion, imagenServicio } = req.body;
        const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
 
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });
        if (!usuario.membresia) return res.status(403).json({ error: "Módulo exclusivo para miembros activos." });
 
        await new Servicio({
            correoProveedor: usuario.correo,
            nombreProveedor: `${usuario.nombre} ${usuario.apellido}`.trim(),
            fotoPerfilProveedor: usuario.fotoPerfil || '',
            nombreServicio, categoriaServicio, modalidad,
            tarifa: parseFloat(tarifa) || 0,
            horarios, certificaciones, descripcion,
            ubicacion: ubicacion || "Poza Rica - Campus UV",
            imagenServicio: imagenServicio || ''
        }).save();
 
        res.json({ ok: true, mensaje: "¡Servicio publicado con éxito!" });
    } catch (err) {
        res.status(500).json({ error: "Error al registrar el servicio." });
    }
});
 
// ==========================================
// API: CREAR PAGO — MERCADO PAGO
// ==========================================
app.post('/api/crear-pago', async (req, res) => {
    try {
        const { correo } = req.body;
        const urlBase = 'https://reboop.onrender.com';
 
        const response = await preferenceClient.create({
            body: {
                items: [{
                    title: 'Membresía REBOOP — Acceso mensual',
                    quantity: 1,
                    unit_price: 10,
                    currency_id: 'MXN'
                }],
                payer: { email: correo },
                back_urls: {
                    success: `${urlBase}/pago-exitoso.html`,
                    failure: `${urlBase}/panel_cliente.html`,
                    pending: `${urlBase}/panel_cliente.html`
                },
                auto_return: 'approved',
                metadata: { correo_usuario: correo },
                notification_url: `${urlBase}/api/webhook-pago`
            }
        });
 
        const url = response.init_point || response.sandbox_init_point || response.body?.init_point;
        console.log("💳 Preferencia MP creada para:", correo, "→", url);
        res.json({ url });
    } catch (err) {
        console.error("❌ Error Mercado Pago crear-pago:", err);
        res.status(500).json({ error: "Error al generar el enlace de pago." });
    }
});
 
// ==========================================
// API: WEBHOOK MERCADO PAGO
// ==========================================
app.post('/api/webhook-pago', async (req, res) => {
    try {
        const { type, data } = req.body;
        console.log("📬 Webhook MP recibido:", type, data);
 
        if (type === 'payment' && data?.id) {
            const pagoInfo = await paymentClient.get({ id: data.id });
            const status   = pagoInfo.status || pagoInfo.body?.status;
            const metadata = pagoInfo.metadata || pagoInfo.body?.metadata;
            const correoU  = metadata?.correo_usuario;
 
            console.log("💰 Pago status:", status, "| Correo:", correoU);
 
            if (status === 'approved' && correoU) {
                await Usuario.findOneAndUpdate(
                    { correo: correoU.toLowerCase().trim() },
                    { $set: { membresia: true, fechaMembresia: new Date() } }
                );
                console.log("✅ Membresía activada para:", correoU);
            }
        }
        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error webhook:", err);
        res.sendStatus(500);
    }
});
 
// ==========================================
// API: VERIFICAR MEMBRESÍA
// ==========================================
app.post('/api/verificar-membresia', async (req, res) => {
    try {
        const { correo } = req.body;
        const u = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
        if (!u) return res.status(404).json({ error: "Usuario no encontrado." });
 
        let activa = false, dias = 0, fechaStr = "N/A";
        if (u.membresia && u.fechaMembresia) {
            const fv = new Date(u.fechaMembresia);
            fv.setMonth(fv.getMonth() + 1);
            if (Date.now() <= fv.getTime()) {
                activa = true;
                dias = Math.ceil((fv.getTime() - Date.now()) / 86400000);
                fechaStr = fv.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
            } else {
                await Usuario.updateOne({ _id: u._id }, { $set: { membresia: false } });
            }
        }
 
        res.json({
            membresia: activa,
            diasRestantes: dias,
            fechaVencimiento: fechaStr,
            beneficiosGanados: [
                "Publicación ilimitada de residuos electrónicos (E-waste).",
                "Soporte prioritario y contacto directo con empresas recicladoras.",
                "Visualización preferente en el Marketplace REBOOP.",
                "Acceso a métricas de impacto ambiental."
            ],
            permiteRenovar: !activa
        });
    } catch (err) {
        res.status(500).json({ error: "Error al verificar membresía." });
    }
});
 
// ==========================================
// API: TOGGLE VISIBILIDAD
// ==========================================
app.post('/api/toggle-visibilidad', async (req, res) => {
    try {
        const { id, tipo } = req.body;
        const Modelo = tipo === 'servicio' ? Servicio : Producto;
        const doc = await Modelo.findById(id);
        if (!doc) return res.status(404).json({ error: "No encontrado." });
        doc.activo = !doc.activo;
        await doc.save();
        res.json({ activo: doc.activo, mensaje: doc.activo ? "Visible" : "Oculto" });
    } catch (err) {
        res.status(500).json({ error: "Error al cambiar visibilidad." });
    }
});
 
app.post('/api/ocultar-producto', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const producto = await Producto.findById(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
        if (producto.correoVendedor.toLowerCase() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        const nuevoEstado = !producto.activo;
        await Producto.findByIdAndUpdate(id, { $set: { activo: nuevoEstado } });
        res.json({ mensaje: nuevoEstado ? "Producto visible." : "Producto oculto.", activo: nuevoEstado });
    } catch (err) {
        res.status(500).json({ error: "Error al ocultar." });
    }
});
 
app.post('/api/ocultar-servicio', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const servicio = await Servicio.findById(id);
        if (!servicio) return res.status(404).json({ error: "Servicio no encontrado." });
        if (servicio.correoProveedor.toLowerCase() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        const nuevoEstado = !servicio.activo;
        await Servicio.findByIdAndUpdate(id, { $set: { activo: nuevoEstado } });
        res.json({ mensaje: nuevoEstado ? "Servicio visible." : "Servicio oculto.", activo: nuevoEstado });
    } catch (err) {
        res.status(500).json({ error: "Error al ocultar." });
    }
});
 
// ==========================================
// API: ELIMINAR PUBLICACIÓN
// ==========================================
app.post('/api/eliminar-producto', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const producto = await Producto.findById(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
        if (producto.correoVendedor.toLowerCase() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        if (producto.imagenes) {
            producto.imagenes.forEach(img => {
                const ruta = path.join(__dirname, img);
                if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
            });
        }
        await Producto.findByIdAndDelete(id);
        res.json({ mensaje: "Producto eliminado." });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar." });
    }
});
 
app.post('/api/eliminar-servicio', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const servicio = await Servicio.findById(id);
        if (!servicio) return res.status(404).json({ error: "Servicio no encontrado." });
        if (servicio.correoProveedor.toLowerCase() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        if (servicio.imagenServicio) {
            const ruta = path.join(__dirname, servicio.imagenServicio);
            if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
        }
        await Servicio.findByIdAndDelete(id);
        res.json({ mensaje: "Servicio eliminado." });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar." });
    }
});
 
// ==========================================
// API: INTERACCIONES (LIKE / GUARDAR)
// ==========================================
app.post('/api/interaccion', async (req, res) => {
    try {
        const { id, tipo, accion, correo } = req.body;
        const Modelo = tipo === 'servicio' ? Servicio : Producto;
        const update = accion === 'like'
            ? { $addToSet: { likes: correo } }
            : { $addToSet: { guardadoPor: correo } };
        await Modelo.findByIdAndUpdate(id, update);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error en interacción." });
    }
});
 
// ==========================================
// API: ADMINISTRACIÓN
// ==========================================
app.get('/api/admin/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.find({}, { contraseña: 0 });
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener usuarios." });
    }
});
 
app.post('/api/admin/eliminar-usuario', async (req, res) => {
    try {
        await Usuario.findByIdAndDelete(req.body.id);
        res.json({ mensaje: "Usuario eliminado." });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar usuario." });
    }
});
 
app.post('/api/admin/toggle-membresia', async (req, res) => {
    try {
        const u = await Usuario.findById(req.body.id);
        u.membresia = !u.membresia;
        u.fechaMembresia = u.membresia ? new Date() : null;
        await u.save();
        res.json({ membresia: u.membresia });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar membresía." });
    }
});
 
app.post('/api/admin/editar-general', async (req, res) => {
    try {
        const { id, tipo, campo1, campo2, campo3 } = req.body;
        if (tipo === 'usuario') await Usuario.findByIdAndUpdate(id, { nombre: campo1, apellido: campo2, ciudad: campo3 });
        else if (tipo === 'producto') await Producto.findByIdAndUpdate(id, { titulo: campo1, categoria: campo2, descripcion: campo3 });
        else if (tipo === 'servicio') await Servicio.findByIdAndUpdate(id, { nombreServicio: campo1, categoriaServicio: campo2, descripcion: campo3 });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: "Error al editar." });
    }
});
 
app.post('/api/admin/eliminar-producto-admin', async (req, res) => {
    try {
        const producto = await Producto.findById(req.body.id);
        if (producto?.imagenes) {
            producto.imagenes.forEach(img => {
                const ruta = path.join(__dirname, img);
                if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
            });
        }
        await Producto.findByIdAndDelete(req.body.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: "Error." });
    }
});
 
app.post('/api/admin/eliminar-servicio-admin', async (req, res) => {
    try {
        const servicio = await Servicio.findById(req.body.id);
        if (servicio?.imagenServicio) {
            const ruta = path.join(__dirname, servicio.imagenServicio);
            if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
        }
        await Servicio.findByIdAndDelete(req.body.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: "Error." });
    }
});
 
// ==========================================
// API: REPORTES PDF
// ==========================================
const PDFDocument = require('pdfkit');
 
app.get('/api/reporte/usuarios', async (req, res) => {
    const usuarios = await Usuario.find({});
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=usuarios.pdf');
    doc.pipe(res);
    doc.fontSize(20).text('REPORTE DE USUARIOS REBOOP').moveDown();
    usuarios.forEach((u, i) => {
        doc.fontSize(11)
           .text(`${i+1}. ${u.nombre} ${u.apellido}`)
           .text(`Correo: ${u.correo}`)
           .text(`Ciudad: ${u.ciudad}`)
           .text(`Rol: ${u.rol}`)
           .text(`Membresía: ${u.membresia ? 'Premium' : 'Normal'}`)
           .moveDown();
    });
    doc.end();
});
 
app.get('/api/reporte/productos', async (req, res) => {
    const productos = await Producto.find({});
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.fontSize(20).text('REPORTE DE PRODUCTOS REBOOP').moveDown();
    productos.forEach((p, i) => {
        doc.fontSize(11)
           .text(`${i+1}. ${p.titulo}`)
           .text(`Precio: $${p.precio}`)
           .text(`Estado: ${p.estado}`)
           .text(`Vendedor: ${p.nombreVendedor}`)
           .moveDown();
    });
    doc.end();
});
 
app.get('/api/reporte/servicios', async (req, res) => {
    const servicios = await Servicio.find({});
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.fontSize(20).text('REPORTE DE SERVICIOS REBOOP').moveDown();
    servicios.forEach((s, i) => {
        doc.fontSize(11)
           .text(`${i+1}. ${s.nombreServicio}`)
           .text(`Tarifa: $${s.tarifa}`)
           .text(`Proveedor: ${s.nombreProveedor}`)
           .moveDown();
    });
    doc.end();
});
 
app.post('/api/enviar-reportes', async (req, res) => {
    try {
        const { correo } = req.body;
        const urlBase = 'https://reboop.onrender.com';
        await transportador.sendMail({
            from: `"REBOOP Admin" <${process.env.EMAIL_USER}>`,
            to: correo,
            subject: 'Reporte Administrativo REBOOP',
            html: `<h2 style="color:#2ecc71;">Reportes REBOOP</h2>
                   <p>Descarga los reportes desde los siguientes enlaces:</p>
                   <ul>
                     <li><a href="${urlBase}/api/reporte/usuarios">📊 Reporte de Usuarios</a></li>
                     <li><a href="${urlBase}/api/reporte/productos">📦 Reporte de Productos</a></li>
                     <li><a href="${urlBase}/api/reporte/servicios">🛠️ Reporte de Servicios</a></li>
                   </ul>`
        });
        res.json({ ok: true });
    } catch (err) {
        console.error("❌ Error enviando reportes:", err);
        res.status(500).json({ error: "Error enviando reportes." });
    }
});
 
app.post('/api/localizar-municipio', (req, res) => res.json({ ubicacion: "Poza Rica de Hidalgo, Veracruz" }));
 
// ==========================================
// ARRANQUE DEL SERVIDOR
// ==========================================
app.listen(PORT, () => console.log(`🚀 REBOOP encendido en http://localhost:${PORT}`));
