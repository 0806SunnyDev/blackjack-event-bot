const { ethers } = require('ethers');
const mongoose = require('mongoose');
const quais = require('quais');
const User = require('./models/User');
const Deposit = require('./models/Deposit');
const connectDB = require('./config/db');
require('dotenv').config();

const contractABI = [
    'function getContractBalance() view returns (uint256)',
    'event Deposit(address indexed user, uint256 amount)'
]

// Environment variables
const PROVIDER_URL = process.env.PROVIDER_URL; // e.g., Infura, Alchemy, or http://localhost:8545
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Deployed contract address

// Initialize provider
const provider = new quais.JsonRpcProvider(PROVIDER_URL, undefined, {usePathing: true});

// Initialize contract
async function getContract() {
  const blackjackContract = new quais.Contract(CONTRACT_ADDRESS, contractABI, provider);
  return blackjackContract;
}

// Helper function to convert Wei to Ether string
function weiToEtherString(weiAmount) {
  return quais.utils.formatEther(weiAmount).toString();
}

// Helper function to parse Wei amount to string
function parseWeiToString(weiAmount) {
  return weiAmount.toString();
}

// Set up event listeners
async function setupEventListeners(contract) {
    console.log('Setting up event listeners...');
  
    try {
      // Fetch the latest deposit record to determine the starting block
      let latestDepositRecord = await Deposit.findOne().sort({ _id: -1 });
      const startBlockNum = latestDepositRecord?.block ? latestDepositRecord.block + 1 : 1422016; // Start from the next block
      console.log('Starting block number:', startBlockNum);
  
      // Query past Deposit events
      const depositFilter = contract.filters.Deposit();
      const events = await contract.queryFilter(depositFilter, startBlockNum);
  
      // Sort events by blockNumber in ascending order
      events.sort((a, b) => a.blockNumber - b.blockNumber);
  
      // Process all events
      if (events.length === 0) {
        console.log('No new Deposit events found.');
      } else {
        for (const event of events) {
          const { blockNumber, args } = event;
          const [address, amount] = args; // Assuming args[0] is address, args[1] is amount
          console.log("amount => ", amount)
          const decimals = 18; // Ideally, fetch from contract if not fixed
  
          // Find user
          let user = await User.findOne({ address });
          if (!user) {
            const newUser = new User({
                address: address,
                balance: "0"
            })

            await newUser.save();
          } else {
  
            // Update user balance (handle BigNumber and decimals safely)
            console.log("user amount => ", user.balance)
            user.balance = (Number(user.balance) + (Number(amount) / 10 ** decimals)).toString();
            console.log("user amount => ", user.balance)
    
            // Save user
            await user.save();

          }
  
          // Create a new deposit record
          const newDepositRecord = new Deposit({
            block: blockNumber,
            address,
            amount: Number(amount) / 10 ** decimals,
          });
          await newDepositRecord.save();
  
          console.log(`Processed Deposit event: Block=${blockNumber}, Address=${address}, Amount=${user.amount}`);
        }
  
        // Log the latest processed block
        const latestBlock = events[events.length - 1].blockNumber;
        console.log('Latest processed block:', latestBlock);
      }
  
      // Set up real-time event listener for new Deposit events
      contract.on('Deposit', async (address, amount, event) => {
        try {
          const blockNumber = event.blockNumber;
  
          // Find user
          let user = await User.findOne({ address });
          if (!user) {
            console.error(`User not found for address: ${address}`);
            return;
          }
  
          // Update user balance
          const decimals = 18;
          user.amount += Number(amount) / 10 ** decimals;
          await user.save();
  
          // Save new deposit record
          const newDepositRecord = new Deposit({
            block: blockNumber,
            address,
            amount: Number(amount) / 10 ** decimals,
          });
          await newDepositRecord.save();
  
          console.log(`New Deposit event: Block=${blockNumber}, Address=${address}, Amount=${user.amount}`);
        } catch (error) {
          console.error('Error processing real-time Deposit event:', error);
        }
      });
  
      console.log('Event listeners set up successfully.');
    } catch (error) {
      console.error('Error in setupEventListeners:', error);
      throw error; // Or handle as needed
    }
}

// Main function to start the bot
async function startBot() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Test Ethereum provider connection
    const network = await provider.getNetwork();
    console.log(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);
    
    // Initialize contract
    const contract = await getContract();

    const contractBalance = await contract.getContractBalance()
    console.log("### contract balance => ", contractBalance)
    
    // Call setupEventListeners initially
    await setupEventListeners(contract);
    
    // Set up interval to call setupEventListeners every 5 seconds
    setInterval(async () => {
      try {
        await setupEventListeners(contract);
      } catch (error) {
        console.error('Error in periodic setupEventListeners call:', error);
      }
    }, 5000); // 5000 milliseconds = 5 seconds
    
    console.log(`Bot is running and listening for events on contract ${CONTRACT_ADDRESS}`);
  } catch (error) {
    console.error('Error starting bot:', error);
    setTimeout(startBot, 10000); // Retry after 10 seconds
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