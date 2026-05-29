const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const mercadopago = require('mercadopago');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
// 1. RENDERIZADO DE POSTS CON OPCIONES SOCIALES Y DE GESTIÓN
function renderizarPostCard(p, esPerfil = false) {
    const idPost = p._id;
    const correoActual = localStorage.getItem('user_correo');
    const isOwner = (p.correoVendedor || p.correoProveedor) === correoActual;
    const esServicio = p.tipoElemento === 'servicio';
    
    return `
        <div class="post-card" id="card-${idPost}" style="border-left: 5px solid ${p.activo ? (esServicio ? '#3498db' : '#2ecc71') : '#7f8c8d'};">
            
            <div class="post-acciones-propias">
                <span class="material-icons" onclick="toggleMenu('${idPost}')" style="cursor:pointer; color:#7f8c8d;">more_vert</span>
                <div id="menu-${idPost}" class="dropdown-content">
                    ${isOwner ? `
                        <button class="btn-accion-post" onclick="ocultarPublicacion('${idPost}', '${p.tipoElemento}')">
                            ${p.activo ? '🙈 Ocultar' : '👁️ Mostrar'}
                        </button>
                        <button class="btn-accion-post" onclick="eliminarPublicacion('${idPost}', '${p.tipoElemento}')" style="color:#e74c3c;">🗑️ Eliminar</button>
                    ` : `
                        <button class="btn-accion-post" onclick="compartir('${idPost}', '${p.tipoElemento}')">🔁 Compartir</button>
                    `}
                </div>
            </div>

            <div class="post-body">
                <div class="post-title">${p.titulo || p.nombreServicio}</div>
                <p class="post-desc">${p.descripcion}</p>
                <div class="post-footer">
                    <button onclick="darLike('${idPost}', '${p.tipoElemento}')" style="background:none; border:none; color:#e74c3c; cursor:pointer; display:flex; align-items:center;">
                        <span class="material-icons" style="font-size:18px;">favorite</span> (${p.likes?.length || 0})
                    </button>
                    <button onclick="guardar('${idPost}', '${p.tipoElemento}')" style="background:none; border:none; color:#f1c40f; cursor:pointer; display:flex; align-items:center;">
                        <span class="material-icons" style="font-size:18px;">bookmark</span> Guardar
                    </button>
                </div>
            </div>
        </div>`;
}

// 2. FUNCIONES DE GESTIÓN Y SOCIALES
function toggleMenu(id) {
    const menu = document.getElementById(`menu-${id}`);
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

async function ocultarPublicacion(id, tipo) {
    const res = await fetch('/api/toggle-visibilidad', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, tipo })
    });
    if(res.ok) {
        alert('Estado actualizado');
        cargarMisPublicaciones();
    }
}

async function darLike(id, tipo) {
    await fetch('/api/interaccion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, tipo, accion: 'like', correo: localStorage.getItem('user_correo') })
    });
    cargarMuroFeed();
}

async function guardar(id, tipo) {
    await fetch('/api/interaccion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, tipo, accion: 'guardar', correo: localStorage.getItem('user_correo') })
    });
    alert("Publicación guardada en tu perfil.");
}

// 3. CARGA DE DATOS
async function cargarMisPublicaciones() {
    const contenedor = document.getElementById('contenedor-mis-publicaciones');
    const miCorreo = localStorage.getItem('user_correo');
    const res = await fetch('/api/inicio-feed');
    const totalItems = await res.json();
    
    // Mostramos TODAS las publicaciones del usuario (activas e inactivas)
    const misPosts = totalItems.filter(p => (p.correoVendedor || p.correoProveedor || '').toLowerCase().trim() === miCorreo.toLowerCase().trim());
    
    contenedor.innerHTML = misPosts.length > 0 
        ? misPosts.map(p => renderizarPostCard(p, true)).join('')
        : '<p style="color:#7f8c8d; text-align:center;">No tienes publicaciones.</p>';
}

// Middleware de parseo de datos y archivos estáticos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Asegurar existencia de directorios de almacenamiento local
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./uploads/productos')) fs.mkdirSync('./uploads/productos');

// ==========================================
// 📁 MULTER — FOTOS DE PERFIL
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
// 📁 MULTER — FOTOS DE PRODUCTOS (Hasta 6 imágenes)
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
// 💳 MERCADO PAGO (PRODUCCIÓN ACTIVA CON BYPASS SEGURO)
// ==========================================
let preferenceClient;
let paymentClient;
try {
    const MPConfig = mercadopago.MercadoPagoConfig || mercadopago.default;
    if (MPConfig && typeof MPConfig === 'function') {
        const mpClient = new MPConfig({ 
            accessToken: 'APP_USR-6059298288599424-052219-c0da52b04df1666752dae727e4620f3a-3420060448' 
        });
        preferenceClient = new mercadopago.Preference(mpClient);
        paymentClient    = new mercadopago.Payment(mpClient);
        console.log("💳 Mercado Pago inicializado con SDK Moderno (v3) [PRODUCCIÓN].");
    } else {
        mercadopago.configure({ 
            access_token: 'APP_USR-6059298288599424-052219-c0da52b04df1666752dae727e4620f3a-3420060448' 
        });
        preferenceClient = mercadopago.preferences;
        paymentClient    = mercadopago.payment;
        console.log("💳 Mercado Pago inicializado con SDK Clásico [PRODUCCIÓN].");
    }
} catch (e) {
    console.log("⚠️ Alerta con SDK, aplicando bypass manual de objetos en producción...");
    mercadopago.configure?.({ access_token: 'APP_USR-6059298288599424-052219-c0da52b04df1666752dae727e4620f3a-3420060448' });
}

// ==========================================
// ✉️ NODEMAILER (CONFIGURACIÓN DE GMAIL)
// ==========================================
const transportador = nodemailer.createTransport({
    service: 'gmail',
    // AGREGA ESTA LÍNEA:
    socketTimeout: 10000, 
    connectionTimeout: 10000,
    // Obliga a usar IPv4:
    family: 4, 
    auth: { 
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});
// ==========================================
// ☁️ CONEXIÓN DE BASE DE DATOS (MONGO ATLAS)
// ==========================================
const uriAtlas = "mongodb+srv://edwin_admin:ClaveAtlas123@reboop.3vbu9o2.mongodb.net/reboop_db?retryWrites=true&w=majority&appName=REBOOP";
mongoose.connect(uriAtlas)
    .then(() => console.log("🍃 Conectado con éxito a MONGODB ATLAS ☁️"))
    .catch(err => console.error("❌ Error de conexión a MongoDB Atlas:", err));

// ==========================================
// 📊 SCHEMAS & MODELOS DE MONGOOSE
// ==========================================
const UsuarioSchema = new mongoose.Schema({
    nombre: String, 
    apellido: String, 
    fechaNacimiento: String,
    ciudad: String, 
    correo: { type: String, unique: true, required: true },
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
    marca: String,
    modelo: String,
    ram: String,
    procesador: String,
    almacenamiento: String,
    sistemaOperativo: String,
    pantalla: String,
    velocidad: String,
    puertos: String,
    capacidad: String,
    conectividad: String,
    contieneBateria: String,
    materialPredominante: String,
    riesgoAmbiental: String,
    pesoAproximado: String,
    imagenes: [String],
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
    fechaPublicacion: { type: Date, default: Date.now },
    activo: { type: Boolean, default: true }
});

const Usuario  = mongoose.model('Usuario',  UsuarioSchema,  'usuarios');
const Producto = mongoose.model('Producto', ProductoSchema, 'productos');
const Servicio = mongoose.model('Servicio', ServicioSchema, 'servicios');

// ==========================================
// 📂 ENRUTAMIENTO DE VISTAS HTML
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/registro.html', (req, res) => res.sendFile(path.join(__dirname, 'registro.html')));
app.get('/confirmar.html', (req, res) => res.sendFile(path.join(__dirname, 'confirmar.html')));
app.get('/panel_admin.html', (req, res) => res.sendFile(path.join(__dirname, 'panel_admin.html')));
app.get('/panel_cliente.html', (req, res) => res.sendFile(path.join(__dirname, 'panel_cliente.html')));
app.get('/pago-exitoso.html', (req, res) => res.sendFile(path.join(__dirname, 'pago-exitoso.html')));

// ==========================================
// 🔑 API: LOGIN SEGURA
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
        res.status(500).json({ error: "Error interno en el inicio de sesión." });
    }
});

// ==========================================
// 📝 API: REGISTRO CON TOKEN AUTOMÁTICO
// ==========================================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, apellidoPaterno, apellidoMaterno, fechaNacimiento, telefono, ciudad, correo, password } = req.body;
        const correoLimpio = correo.toLowerCase().trim();

        const todos = await Usuario.find({});
        const existe = todos.find(u => (u.correo || '').toLowerCase().trim() === correoLimpio);
        if (existe) return res.status(400).json({ error: "El correo ya está registrado." });

        const codigo = Math.floor(10000 + Math.random() * 90000).toString();
        const CORREO_ADMIN = 'eciap.perez.s4712.4@gmail.com';

        await new Usuario({
            nombre: nombre.trim(),
            apellido: `${apellidoPaterno.trim()} ${apellidoMaterno.trim()}`,
            fechaNacimiento: fechaNacimiento.trim(),
            teléfono: telefono.trim(), ciudad: ciudad.trim(),
            correo: correoLimpio, contraseña: password.trim(),
            rol: correoLimpio === CORREO_ADMIN ? 'administrador' : 'usuario',
            cuentaConfirmada: false, tokenVerificacion: codigo,
            membresia: false, fechaMembresia: null, fotoPerfil: '', presentacion: ''
        }).save();

        transportador.sendMail({
            from: '"Ecosistema REBOOP ♻️" <eciap.perez.s4712.4@gmail.com>',
            to: correoLimpio,
            subject: '🔑 Código de confirmación - REBOOP',
            html: `<div style="font-family:sans-serif;background:#1a2333;color:white;padding:30px;border-radius:10px;border-top:5px solid #2ecc71;">
                <h1 style="color:#2ecc71;text-align:center;">REBOOP</h1>
                <p>¡Hola <strong>${nombre}</strong>! Tu código de verificación obligatorio es:</p>
                <div style="background:#0f141c;text-align:center;padding:15px;margin:20px 0;border-radius:6px;">
                    <span style="font-size:2.5rem;font-weight:bold;letter-spacing:5px;color:#f1c40f;">${codigo}</span>
                </div></div>`
        }, (err) => { if (err) console.error("❌ Error al despachar email:", err); });

        res.json({ mensaje: "Usuario registrado. Código enviado.", correo: correoLimpio });
    } catch (err) {
        res.status(500).json({ error: "Error interno en el proceso de registro." });
    }
});

// ==========================================
// 🔑 API: CONFIRMAR CUENTA POR TOKEN
// ==========================================
app.post('/api/confirmar-cuenta', async (req, res) => {
    try {
        const { correo, codigo } = req.body;
        const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });
        if (usuario.tokenVerificacion !== codigo.trim())
            return res.status(400).json({ error: "El código de verificación es incorrecto." });
            
        usuario.cuentaConfirmada = true;
        usuario.tokenVerificacion = null;
        await usuario.save();
        res.json({ ok: true, mensaje: "¡Cuenta verificada con éxito!" });
    } catch (err) {
        res.status(500).json({ error: "Error al procesar la confirmación." });
    }
});

// ==========================================
// 👤 API: EDITAR PERFIL (DATOS EDITABLES)
// ==========================================
app.post('/api/editar-perfil', async (req, res) => {
    try {
        const { correo, nombre, apellido, telefono, ciudad, presentacion } = req.body;
        const todos = await Usuario.find({});
        const u = todos.find(x => (x.correo || '').toLowerCase().trim() === correo.toLowerCase().trim());
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
        res.json({ mensaje: "Perfil actualizado.", nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono.trim(), ciudad: ciudad.trim(), presentacion: presentacion.trim() });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar los datos en Atlas." });
    }
});

// ==========================================
// 📸 API: SUBIR FOTO DE PERFIL
// ==========================================
app.post('/api/subir-foto', uploadPerfil.single('foto'), async (req, res) => {
    try {
        const { correo } = req.body;
        if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen." });
        const urlFoto = `/uploads/${req.file.filename}`;
        
        const todos = await Usuario.find({});
        const u = todos.find(x => (x.correo || '').toLowerCase().trim() === correo.toLowerCase().trim());
        if (!u) return res.status(404).json({ error: "Usuario no encontrado." });
        
        if (u.fotoPerfil) { 
            const ruta = path.join(__dirname, u.fotoPerfil); 
            if (fs.existsSync(ruta)) fs.unlinkSync(ruta); 
        }
        await Usuario.updateOne({ _id: u._id }, { $set: { fotoPerfil: urlFoto } });
        res.json({ mensaje: "Foto actualizada con éxito.", urlFoto });
    } catch (err) {
        res.status(500).json({ error: "Error al procesar la subida del avatar." });
    }
});

// ==========================================
// 📺 API: INICIO UNIFICADO (MERCADO COMPLETO)
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

        const productosMapeados = productos.map(p => ({ ...p, tipoElemento: 'producto' }));
        const serviciosMapeados = servicios.map(s => ({ ...s, tipoElemento: 'servicio' }));

        let feedCompleto = [...productosMapeados, ...serviciosMapeados];

        if (orden === 'baratos') {
            feedCompleto.sort((a, b) => (a.precio || a.tarifa || 0) - (b.precio || b.tarifa || 0));
        } else if (orden === 'pasadas') {
            feedCompleto.sort((a, b) => new Date(a.fechaPublicacion) - new Date(b.fechaPublicacion));
        } else {
            feedCompleto.sort((a, b) => new Date(b.fechaPublicacion) - new Date(a.fechaPublicacion));
        }

        res.json(feedCompleto);
    } catch (err) {
        res.status(500).json({ error: "Fallo al compilar feed unificado." });
    }
});

// Ruta de respaldo por compatibilidad
app.get('/api/productos', async (req, res) => {
    try {
        const { buscar, orden } = req.query;
        let filtro = { activo: true };
        if (buscar) {
            const regex = new RegExp(buscar.trim(), 'i');
            filtro.$or = [{ titulo: regex }, { descripcion: regex }, { marca: regex }, { categoria: regex }, { subcategoria: regex }];
        }
        let consulta = Producto.find(filtro);
        if (orden === 'recientes') consulta = consulta.sort({ fechaPublicacion: -1 });
        else if (orden === 'pasadas') consulta = consulta.sort({ fechaPublicacion: 1 });
        else if (orden === 'baratos') consulta = consulta.sort({ precio: 1 });
        else consulta = consulta.sort({ fechaPublicacion: -1 });

        const productos = await consulta.lean();
        res.json(productos);
    } catch { res.status(500).json({ error: "Fallo" }); }
});

// ==========================================
// 🚀 API: PUBLICAR PRODUCTO (FOTO ASOCIADA)
// ==========================================
app.post('/api/publicar-producto', uploadProducto.array('imagenes', 6), async (req, res) => {
    try {
        const { correo } = req.body;
        const todos = await Usuario.find({});
        const usuario = todos.find(u => (u.correo || '').toLowerCase().trim() === correo.toLowerCase().trim());

        if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });
        if (!usuario.membresia) return res.status(403).json({ error: "Necesitas membresía activa para publicar." });
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "Debes subir al menos una imagen obligatoria." });

        const imagenes = req.files.map(f => `/uploads/productos/${f.filename}`);

        const producto = new Producto({
            correoVendedor: correo.toLowerCase().trim(),
            nombreVendedor: `${(usuario.nombre || '').trim()} ${(usuario.apellido || '').trim()}`.trim(),
            fotoPerfilVendedor: usuario.fotoPerfil || '',
            titulo:         req.body.titulo,
            categoria:      req.body.categoria,
            subcategoria:   req.body.subcategoria,
            estado:         req.body.estado,
            aprovechamiento: req.body.aprovechamiento,
            descripcion:    req.body.descripcion,
            precio:         parseFloat(req.body.precio) || 0,
            ubicacion:      req.body.ubicacion,
            marca:          req.body.marca          || '',
            modelo:         req.body.modelo         || '',
            ram:            req.body.ram            || '',
            procesador:     req.body.procesador     || '',
            almacenamiento: req.body.almacenamiento || '',
            sistemaOperativo: req.body.sistemaOperativo || '',
            pantalla:       req.body.pantalla       || '',
            velocidad:      req.body.velocidad      || '',
            puertos:        req.body.puertos        || '',
            capacidad:      req.body.capacidad      || '',
            conectividad:   req.body.conectividad   || '',
            contieneBateria: req.body.contieneBateria || '',
            materialPredominante: req.body.materialPredominante || '',
            riesgoAmbiental: req.body.riesgoAmbiental || 'Bajo',
            pesoAproximado: req.body.pesoAproximado || '',
            imagenes
        });

        await producto.save();
        res.json({ ok: true, mensaje: "¡Producto catalogado con éxito en el muro REBOOP!" });
    } catch (err) {
        console.error("❌ Error al publicar:", err);
        res.status(500).json({ error: "Hubo un fallo interno al cargar el hardware." });
    }
});

// ==========================================
// 🛠️ API: PUBLICAR SERVICIO TÉCNICO PREMIUM
// ==========================================
app.post('/api/publicar-servicio', async (req, res) => {
    try {
        const { correo, nombreServicio, categoriaServicio, modalidad, tarifa, horarios, certificaciones, descripcion, ubicacion, imagenServicio } = req.body;
        const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
        
        if (!usuario) return res.status(444).json({ error: "Usuario inexistente." });
        if (!usuario.membresia) return res.status(403).json({ error: "Módulo exclusivo para miembros con suscripción activa." });

        await new Servicio({
            correoProveedor: usuario.correo,
            nombreProveedor: `${usuario.nombre} ${usuario.apellido}`.trim(),
            fotoPerfilProveedor: usuario.fotoPerfil || '',
            nombreServicio,
            categoriaServicio,
            modalidad,
            tarifa: parseFloat(tarifa) || 0,
            horarios,
            certificaciones,
            descripcion,
            ubicacion: ubicacion || "Poza Rica - Campus UV",
            imagenServicio: imagenServicio || ''
        }).save();

        res.json({ ok: true, mensaje: "¡Servicio técnico publicado con éxito!" });
    } catch (err) {
        res.status(500).json({ error: "Error en el servidor al registrar la oferta de servicio." });
    }
});

// ==========================================
// 💳 API: CREAR PREFERENCIA DE PAGO REAL
// ==========================================
app.post('/api/crear-pago', async (req, res) => {
    try {
        const { correo } = req.body;
        const urlBase = `${req.protocol}://${req.headers.host}`;
        const payload = {
            body: {
                items: [{ title: 'Membresía REBOOP - Acceso mensual', quantity: 1, unit_price: 10, currency_id: 'MXN' }],
                payer: { email: correo },
                back_urls: { success: `${urlBase}/pago-exitoso.html`, failure: `${urlBase}/panel_cliente.html`, pending: `${urlBase}/panel_cliente.html` },
                auto_return: 'approved',
                metadata: { correo_usuario: correo },
                notification_url: `${urlBase}/api/webhook-pago`
            }
        };
        const response = typeof preferenceClient.create === 'function'
            ? await preferenceClient.create(payload)
            : await preferenceClient.create(payload.body);
        res.json({ url: response.sandbox_init_point || response.body?.sandbox_init_point || response.init_point });
    } catch (err) {
        res.status(500).json({ error: "Error al generar pasarela bancaria." });
    }
});

// ==========================================
// 🛡️ API: WEBHOOK DE MERCADO PAGO
// ==========================================
app.post('/api/webhook-pago', async (req, res) => {
    try {
        const { type, data } = req.body;
        if (type === 'payment') {
            const pagoInfo = await paymentClient.get({ id: data.id });
            const status   = pagoInfo.status   || pagoInfo.body?.status;
            const metadata = pagoInfo.metadata || pagoInfo.body?.metadata;
            if (status === 'approved' && metadata?.correo_usuario)
                await Usuario.findOneAndUpdate({ correo: metadata.correo_usuario.toLowerCase().trim() }, { $set: { membresia: true, fechaMembresia: new Date() } });
        }
        res.sendStatus(200);
    } catch { res.sendStatus(500); }
});

// ==========================================
// 👁️ API: OCULTAR PRODUCTO (toggle activo en BD)
// ==========================================
app.post('/api/ocultar-producto', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const producto = await Producto.findById(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
        if (producto.correoVendedor.toLowerCase().trim() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        const nuevoEstado = !producto.activo;
        await Producto.findByIdAndUpdate(id, { $set: { activo: nuevoEstado } });
        res.json({ mensaje: nuevoEstado ? "Producto visible." : "Producto oculto.", activo: nuevoEstado });
    } catch (err) {
        res.status(500).json({ error: "Error al ocultar." });
    }
});

// ==========================================
// 👁️ API: OCULTAR SERVICIO (toggle activo en BD)
// ==========================================
app.post('/api/ocultar-servicio', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const servicio = await Servicio.findById(id);
        if (!servicio) return res.status(404).json({ error: "Servicio no encontrado." });
        if (servicio.correoProveedor.toLowerCase().trim() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        const nuevoEstado = !servicio.activo;
        await Servicio.findByIdAndUpdate(id, { $set: { activo: nuevoEstado } });
        res.json({ mensaje: nuevoEstado ? "Servicio visible." : "Servicio oculto.", activo: nuevoEstado });
    } catch (err) {
        res.status(500).json({ error: "Error al ocultar." });
    }
});

// ==========================================
// 🗑️ API: ELIMINAR PRODUCTO (BD + imágenes del disco)
// ==========================================
app.post('/api/eliminar-producto', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const producto = await Producto.findById(id);
        if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
        if (producto.correoVendedor.toLowerCase().trim() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        // Borrar imágenes físicas del servidor
        if (producto.imagenes && producto.imagenes.length > 0) {
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

// ==========================================
// 🗑️ API: ELIMINAR SERVICIO (BD + imagen del disco)
// ==========================================
app.post('/api/eliminar-servicio', async (req, res) => {
    try {
        const { id, correo } = req.body;
        const servicio = await Servicio.findById(id);
        if (!servicio) return res.status(404).json({ error: "Servicio no encontrado." });
        if (servicio.correoProveedor.toLowerCase().trim() !== correo.toLowerCase().trim())
            return res.status(403).json({ error: "Sin permiso." });
        // Borrar imagen física del servidor si existe
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
// ⏱️ API: VALIDAR MEMBRESÍA EN TIEMPO REAL
// ==========================================
app.post('/api/verificar-membresia', async (req, res) => {
    try {
        const { correo } = req.body;
        const u = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
        if (!u) return res.status(404).json({ error: "No encontrado." });
        const datos = u.toObject();
        let activa = false, dias = 0, fechaStr = "N/A";
        if (datos.membresia && datos.fechaMembresia) {
            const fv = new Date(datos.fechaMembresia);
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
            membresia: activa, diasRestantes: dias, fechaVencimiento: fechaStr,
            horaActualPozaRica: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: true }),
            beneficiosGanados: [
                "Publicación ilimitada de residuos electrónicos (E-waste).",
                "Soporte prioritario y contacto directo con empresas recicladoras.",
                "Visualización preferente en el Marketplace REBOOP.",
                "Acceso a métricas de impacto ambiental."
            ],
            permiteRenovar: !activa
        });
    } catch { res.status(500).json({ error: "Error interno de validación." }); }
});
// Toggle Visibilidad (Ocultar/Mostrar)
app.post('/api/toggle-visibilidad', async (req, res) => {
    const { id, tipo } = req.body;
    const Modelo = tipo === 'servicio' ? Servicio : Producto;
    const doc = await Modelo.findById(id);
    doc.activo = !doc.activo; // Cambia el estado sin borrar
    await doc.save();
    res.json({ activo: doc.activo, mensaje: doc.activo ? "Visible" : "Oculto" });
});

// Like y Guardar
app.post('/api/interaccion', async (req, res) => {
    const { id, tipo, accion, correo } = req.body;
    const Modelo = tipo === 'servicio' ? Servicio : Producto;
    const update = accion === 'like' ? { $addToSet: { likes: correo } } : { $addToSet: { guardadoPor: correo } };
    await Modelo.findByIdAndUpdate(id, update);
    res.json({ success: true });
});
// ==========================================
// 🛡️ API: GESTIÓN ADMINISTRATIVA (NUEVAS)
// ==========================================

// Obtener todos los usuarios para la tabla administrativa
app.get('/api/admin/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.find({}, { contraseña: 0 }); // No enviar contraseñas
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener usuarios." });
    }
});

// Eliminar usuario
app.post('/api/admin/eliminar-usuario', async (req, res) => {
    try {
        const { id } = req.body;
        await Usuario.findByIdAndDelete(id);
        res.json({ mensaje: "Usuario eliminado con éxito." });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar usuario." });
    }
});

// Toggle membresía desde el Admin
app.post('/api/admin/toggle-membresia', async (req, res) => {
    try {
        const { id } = req.body;
        const u = await Usuario.findById(id);
        u.membresia = !u.membresia;
        u.fechaMembresia = u.membresia ? new Date() : null;
        await u.save();
        res.json({ membresia: u.membresia });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar membresía." });
    }
});

// Toggle Visibilidad (Ocultar/Mostrar)
app.post('/api/toggle-visibilidad', async (req, res) => {
    const { id, tipo } = req.body;
    const Modelo = tipo === 'servicio' ? Servicio : Producto;
    const doc = await Modelo.findById(id);
    if (!doc) return res.status(404).json({ error: "No encontrado" });
    doc.activo = !doc.activo;
    await doc.save();
    res.json({ activo: doc.activo, mensaje: doc.activo ? "Visible" : "Oculto" });
});

// Like y Guardar
app.post('/api/interaccion', async (req, res) => {
    const { id, tipo, accion, correo } = req.body;
    const Modelo = tipo === 'servicio' ? Servicio : Producto;
    const update = accion === 'like' ? { $addToSet: { likes: correo } } : { $addToSet: { guardadoPor: correo } };
    await Modelo.findByIdAndUpdate(id, update);
    res.json({ success: true });
});
app.post('/api/localizar-municipio', (req, res) => res.json({ ubicacion: "Poza Rica de Hidalgo, Veracruz" }));
// ==========================================
// ADMIN EDITAR GENERAL
// ==========================================

app.post('/api/admin/editar-general', async (req, res) => {

    try{

        const { id, tipo, campo1, campo2, campo3 } = req.body;

        if(tipo === 'usuario'){

            await Usuario.findByIdAndUpdate(id,{
                nombre: campo1,
                apellido: campo2,
                ciudad: campo3
            });

        }else if(tipo === 'producto'){

            await Producto.findByIdAndUpdate(id,{
                titulo: campo1,
                categoria: campo2,
                descripcion: campo3
            });

        }else if(tipo === 'servicio'){

            await Servicio.findByIdAndUpdate(id,{
                nombreServicio: campo1,
                categoriaServicio: campo2,
                descripcion: campo3
            });

        }

        res.json({ ok:true });

    }catch(err){

        res.status(500).json({
            error:'Error al editar'
        });
    }
});


// ==========================================
// ELIMINAR PRODUCTO ADMIN
// ==========================================

app.post('/api/admin/eliminar-producto-admin', async (req, res) => {

    try{

        const { id } = req.body;

        const producto = await Producto.findById(id);

        if(producto.imagenes){

            producto.imagenes.forEach(img=>{

                const ruta = path.join(__dirname, img);

                if(fs.existsSync(ruta)){
                    fs.unlinkSync(ruta);
                }
            });
        }

        await Producto.findByIdAndDelete(id);

        res.json({
            ok:true
        });

    }catch(err){

        res.status(500).json({
            error:'Error'
        });
    }
});


// ==========================================
// ELIMINAR SERVICIO ADMIN
// ==========================================

app.post('/api/admin/eliminar-servicio-admin', async (req, res) => {

    try{

        const { id } = req.body;

        const servicio = await Servicio.findById(id);

        if(servicio.imagenServicio){

            const ruta = path.join(__dirname, servicio.imagenServicio);

            if(fs.existsSync(ruta)){
                fs.unlinkSync(ruta);
            }
        }

        await Servicio.findByIdAndDelete(id);

        res.json({
            ok:true
        });

    }catch(err){

        res.status(500).json({
            error:'Error'
        });
    }
});
// ==========================================
// PDFKIT
// ==========================================

const PDFDocument = require('pdfkit');

// ==========================================
// REPORTE PDF USUARIOS
// ==========================================

app.get('/api/reporte/usuarios', async (req,res)=>{

    const usuarios = await Usuario.find({});

    const doc = new PDFDocument();

    res.setHeader(
        'Content-Type',
        'application/pdf'
    );

    res.setHeader(
        'Content-Disposition',
        'inline; filename=usuarios.pdf'
    );

    doc.pipe(res);

    doc.fontSize(25)
    .text('REPORTE DE USUARIOS REBOOP');

    doc.moveDown();

    usuarios.forEach((u,i)=>{

        doc.fontSize(12)
        .text(`${i+1}. ${u.nombre} ${u.apellido}`);

        doc.text(`Correo: ${u.correo}`);
        doc.text(`Ciudad: ${u.ciudad}`);
        doc.text(`Rol: ${u.rol}`);
        doc.text(`Membresía: ${u.membresia ? 'Premium' : 'Normal'}`);

        doc.moveDown();
    });

    doc.end();
});

// ==========================================
// PDF PRODUCTOS
// ==========================================

app.get('/api/reporte/productos', async (req,res)=>{

    const productos = await Producto.find({});

    const doc = new PDFDocument();

    res.setHeader(
        'Content-Type',
        'application/pdf'
    );

    doc.pipe(res);

    doc.fontSize(25)
    .text('REPORTE PRODUCTOS');

    doc.moveDown();

    productos.forEach((p,i)=>{

        doc.text(`${i+1}. ${p.titulo}`);
        doc.text(`Precio: $${p.precio}`);
        doc.text(`Estado: ${p.estado}`);
        doc.text(`Vendedor: ${p.nombreVendedor}`);

        doc.moveDown();
    });

    doc.end();
});

// ==========================================
// PDF SERVICIOS
// ==========================================

app.get('/api/reporte/servicios', async (req,res)=>{

    const servicios = await Servicio.find({});

    const doc = new PDFDocument();

    res.setHeader(
        'Content-Type',
        'application/pdf'
    );

    doc.pipe(res);

    doc.fontSize(25)
    .text('REPORTE SERVICIOS');

    doc.moveDown();

    servicios.forEach((s,i)=>{

        doc.text(`${i+1}. ${s.nombreServicio}`);
        doc.text(`Tarifa: $${s.tarifa}`);
        doc.text(`Proveedor: ${s.nombreProveedor}`);

        doc.moveDown();
    });

    doc.end();
});

// ==========================================
// ENVIAR REPORTES POR EMAIL
// ==========================================

app.post('/api/enviar-reportes', async (req,res)=>{

    try{

        const { correo } = req.body;

        await transportador.sendMail({

            from:'REBOOP',
            to:correo,
            subject:'Reporte Administrativo REBOOP',

            html:`
                <h1>Reporte generado</h1>
                <p>Se adjuntan reportes administrativos.</p>
            `,

            attachments:[

                {
                    filename:'usuarios.pdf',
                    path:'http://localhost:3000/api/reporte/usuarios'
                },

                {
                    filename:'productos.pdf',
                    path:'http://localhost:3000/api/reporte/productos'
                },

                {
                    filename:'servicios.pdf',
                    path:'http://localhost:3000/api/reporte/servicios'
                }

            ]

        });

        res.json({
            ok:true
        });

    }catch(err){

        console.log(err);

        res.status(500).json({
            error:'Error enviando'
        });
    }
});

app.listen(PORT, () => console.log(`🚀 REBOOP encendido en http://localhost:${PORT}`));
