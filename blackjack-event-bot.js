const { ethers } = require('ethers');
const mongoose = require('mongoose');
const User = require('./models/User');
const connectDB = require('./config/db');
require('dotenv').config();

// Contract ABI (extracted from provided Hardhat artifact)
const contractABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "Deposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "WithdrawalProcessed",
    "type": "event"
  }
];

// Environment variables
const PROVIDER_URL = process.env.PROVIDER_URL; // e.g., Infura or Alchemy URL
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Deployed contract address

// Initialize Ethereum provider and contract
const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);

// Connect to MongoDB
connectDB();

// Helper function to convert Wei to Ether string
function weiToEtherString(weiAmount) {
  return ethers.utils.formatEther(weiAmount).toString();
}

// Helper function to parse Wei amount to string
function parseWeiToString(weiAmount) {
  return weiAmount.toString();
}

// Process Deposit event
async function handleDeposit(userAddress, amount) {
  try {
    console.log(`Deposit event: User=${userAddress}, Amount=${weiToEtherString(amount)} ETH`);
    
    // Find or create user
    const user = await User.findOneAndUpdate(
      { address: userAddress.toLowerCase() },
      { balance: parseWeiToString(amount) },
      { upsert: true, new: true }
    );
    
    console.log(`Updated user ${userAddress}: balance=${user.balance}`);
  } catch (error) {
    console.error('Error processing Deposit event:', error);
  }
}

// Process WithdrawalProcessed event
async function handleWithdrawalProcessed(userAddress, amount) {
  try {
    console.log(`WithdrawalProcessed event: User=${userAddress}, Amount=${weiToEtherString(amount)} ETH`);
    
    // Find user
    const user = await User.findOne({ address: userAddress.toLowerCase() });
    if (!user) {
      console.warn(`User ${userAddress} not found for withdrawal`);
      return;
    }
    
    // Calculate new balance
    const currentBalance = ethers.BigNumber.from(user.balance);
    const withdrawalAmount = ethers.BigNumber.from(amount);
    if (currentBalance.lt(withdrawalAmount)) {
      console.warn(`Insufficient balance for user ${userAddress}: ${user.balance} < ${amount}`);
      return;
    }
    const newBalance = currentBalance.sub(withdrawalAmount);
    
    // Update user balance
    user.balance = newBalance.toString();
    await user.save();
    
    console.log(`Updated user ${userAddress}: balance=${user.balance}`);
  } catch (error) {
    console.error('Error processing WithdrawalProcessed event:', error);
  }
}

// Set up event listeners
function setupEventListeners() {
  console.log('Setting up event listeners...');
  
  // Listen for Deposit event
  contract.on('Deposit', (user, amount, event) => {
    handleDeposit(user, amount);
  });
  
  // Listen for WithdrawalProcessed event
  contract.on('WithdrawalProcessed', (user, amount, event) => {
    handleWithdrawalProcessed(user, amount);
  });
  
  // Handle provider errors
  provider.on('error', (error) => {
    console.error('Provider error:', error);
  });
}

// Main function to start the bot
async function startBot() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    
    // Test Ethereum provider connection
    const network = await provider.getNetwork();
    console.log(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);
    
    // Setup event listeners
    setupEventListeners();
    
    console.log(`Bot is running and listening for events on contract ${CONTRACT_ADDRESS}`);
  } catch (error) {
    console.error('Error starting bot:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down bot...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});

// Start the bot
startBot();