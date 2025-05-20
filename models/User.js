const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  nonce: { type: Number, default: () => Math.floor(Math.random() * 1000000) },
  balance: { type: String, default: "0" },
  gameBalance: { type: String, default: "0" },
});

module.exports = mongoose.model('User', userSchema);