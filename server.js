// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./Router/authRoute');
const adminRoutes = require('./Router/adminRoute');
const morgan = require('morgan');
const subscriptionRoutes = require('./Router/subscriptionRoute');
const transactionRoutes = require('./Router/transactionRoute');
const webhookController = require('./controllers/webhookController'); // Add this import

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json()); 

//app.use(require('./Middleware/requestLogger'));
//app.use('/api', require('./Middleware/auth').apiLimiter);

// Webhook route - must come before express.json() middleware
app.post('/webhook', 
  express.raw({ type: 'application/json' }),
  webhookController.handleWebhook
);

// Other middleware
app.use(express.json());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes); 
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/transactions', transactionRoutes);

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Basic route
app.get('/', (req, res) => {
    res.send('Node.js Server is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Server listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});