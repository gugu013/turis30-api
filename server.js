const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CONFIGURAÇÃO SEGURA: Puxa a string do banco direto das variáveis de ambiente do Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Listener para evitar que o servidor caia se a conexão ociosa com o Neon cair
pool.on('error', (err, client) => {
  console.error('Erro inesperado no cliente do banco ocioso:', err);
});

// Testando a conexão com o banco logo ao ligar o servidor
pool.connect()
  .then(() => console.log('✅ Conectado ao banco de dados Turis30 com sucesso!'))
  .catch(err => console.error('❌ Erro ao conectar no banco:', err.stack));

// Configuração do Cloudinary para upload de imagens reais
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Garante que a pasta uploads existe localmente no ambiente do Render
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: uploadDir });

// Rota para TESTE
app.get('/', (req, res) => {
  res.json({ status: 'Sucesso', mensagem: 'A API do Turis30 está online!' });
});

// Ler todos os locais cadastrados
app.get('/locais', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM pontos_interesse');
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar os locais' });
  }
});

// Cadastrar um novo local
app.post('/locais', async (req, res) => {
  const { nome, categoria, lat, lon, palavraChave, imagemUrl } = req.body;
  try {
    const query = `
      INSERT INTO pontos_interesse (nome, categoria, lat, lon, palavra_chave, imagem, visitas)
      VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *;
    `;
    const valores = [nome, categoria, lat, lon, palavraChave, imagemUrl];
    const resultado = await pool.query(query, valores);
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao cadastrar o local' });
  }
});

// Editar um local existente
app.put('/locais/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, categoria, palavraChave, imagemUrl } = req.body;
  try {
    const query = `
      UPDATE pontos_interesse 
      SET nome = $1, categoria = $2, palavra_chave = $3, imagem = $4
      WHERE id = $5 RETURNING *;
    `;
    const valores = [nome, categoria, palavraChave, imagemUrl, id];
    const resultado = await pool.query(query, valores);
    res.json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao atualizar o local' });
  }
});

// Excluir um local
app.delete('/locais/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pontos_interesse WHERE id = $1', [id]);
    res.json({ mensagem: 'Estabelecimento excluído com sucesso do banco de dados!' });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao excluir o local' });
  }
});

// Buscar comentários de um ponto específico
app.get('/locais/:id/comentarios', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      'SELECT * FROM comentarios WHERE ponto_id = $1 ORDER BY criado_em DESC',
      [id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar comentários' });
  }
});

// Adicionar um novo comentário
app.post('/locais/:id/comentarios', async (req, res) => {
  const { id } = req.params;
  const { autor, texto, estrelas } = req.body;
  try {
    const query = `
      INSERT INTO comentarios (ponto_id, autor, texto, estrelas)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const valores = [id, autor, texto, estrelas || 5];
    const resultado = await pool.query(query, valores);
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao salvar comentário' });
  }
});

// Registrar check-in temporal
app.post('/locais/:id/checkin', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      'INSERT INTO historico_presencas (ponto_id) VALUES ($1)',
      [id]
    );
    const resultadoUpdate = await pool.query(
      'UPDATE pontos_interesse SET visitas = visitas + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    res.status(201).json(resultadoUpdate.rows[0]);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao registrar check-in temporal' });
  }
});

// Buscar histórico de presenças
app.get('/locais/:id/historico', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      'SELECT * FROM historico_presencas WHERE ponto_id = $1 ORDER BY data_hora DESC',
      [id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar histórico de presenças' });
  }
});

// Buscar instants ativos (últimas 24 horas)
app.get('/locais/:id/stories', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT * FROM stories_local 
       WHERE ponto_id = $1 
       AND criado_em >= NOW() - INTERVAL '24 hours'
       ORDER BY criado_em DESC`,
      [id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao buscar instants' });
  }
});

// POSTAR NOVO INSTANT: Upload real para o Cloudinary com foto e legenda opcional
app.post('/locais/:id/stories', upload.single('foto'), async (req, res) => {
  const { id } = req.params;
  const { legenda } = req.body;
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    }

    // Envia o arquivo temporário para o Cloudinary na pasta stories_turis30
    const resultadoCloudinary = await cloudinary.uploader.upload(req.file.path, {
      folder: 'stories_turis30'
    });

    // Remove o arquivo temporário da pasta local do servidor após o upload
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const fotoUrlSegura = resultadoCloudinary.secure_url;

    // Salva a foto e a legenda no banco PostgreSQL
    const query = `
      INSERT INTO stories_local (ponto_id, foto_url, legenda)
      VALUES ($1, $2, $3) RETURNING *;
    `;
    const resultadoBanco = await pool.query(query, [id, fotoUrlSegura, legenda || '']);

    res.status(201).json(resultadoBanco.rows[0]);
  } catch (erro) {
    console.error('ERRO DETALHADO CLOUDINARY:', JSON.stringify(erro, null, 2));
    res.status(500).json({ erro: erro.message || 'Erro ao processar upload da imagem' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando lisinho na porta http://localhost:${port}`);
});