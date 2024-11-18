import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';
dotenv.config();

const app = express(); 

app.use(express.json());
app.use(cors());

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'productDB';

// MongoDB setup
let db;

async function initDb() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB');
}

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Validation schemas
const productSchema = z.object({
  title: z.string().min(1),
  price: z.number().positive(),
  imageUrl: z.string().url(),
  amazonUrl: z.string().url(),
});

// Routes
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true });
});

app.get('/api/products', async (req, res) => {
  const { id } = req.query; // Extract the product ID from the query string
  try {
    if (id) {
      // Query the database for a specific product by id
      const product = await db.collection('products').findOne({ _id: new ObjectId(id) });

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      return res.json(product);
    } else {
      // If no id is provided, return all products
      const products = await db.collection('products').find().sort({ createdAt: -1 }).toArray();
      return res.json(products);
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const validatedData = productSchema.parse(req.body);
    validatedData.createdAt = new Date();
    validatedData.updatedAt = new Date();
    const result = await db.collection('products').insertOne(validatedData);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid product data', errors: error.errors });
    } else {
      res.status(500).json({ message: 'Failed to create product' });
    }
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params; // Get the id from the URL params
  const updateData = req.body; // Get the data to update from the request body

  try {
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const updatedProduct = await db
      .collection('products')
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (updatedProduct.modifiedCount === 0) {
      return res.status(404).json({ message: 'Product not found or no changes made' });
    }

    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const result = await db.collection('products').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});
const PORT = process.env.PORT || 5000;
// Initialize database and start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
