// Withdrawal.tsx
import React, { useState, useEffect } from 'react';
import { ref, onValue, off, update, get } from 'firebase/database';
import { database } from './firebase';
import { CheckCircle, XCircle, Search, Filter, ArrowLeft, AlertCircle, User, Calendar, DollarSign, CreditCard, Loader, MoreVertical } from 'lucide-react';

interface Transaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'rejected';
  method?: string;
  accountNumber?: string;
  accountDetails?: string;
  paymentMethod?: string;
  createdAt: string;
  timestamp?: number;
  processedAt?: string;
  rejectionReason?: string;
  user?: {
    firstName: string;
    lastName: string;
    username: string;
  };
}

interface UserData {
  telegramId: number;
  username: string;
  firstName: string;
  lastName: string;
  profilePhoto?: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  joinDate: string;
  adsWatchedToday: number;
  tasksCompleted: Record<string, number>;
  lastAdWatch?: string;
  referredBy?: string;
}

interface WalletConfig {
  currency: string;
  currencySymbol: string;
  defaultMinWithdrawal: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

interface WithdrawalProps {
  transactions: Transaction[];
  onUpdateTransaction: (transactionId: string, updates: Partial<Transaction>) => void;
  walletConfig: WalletConfig;
}

const Withdrawal: React.FC<WithdrawalProps> = ({ transactions, onUpdateTransaction, walletConfig }) => {
  const [withdrawalRequests, setWithdrawalRequests] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalPending: 0,
    totalCompleted: 0,
    totalRejected: 0,
    totalAmount: 0
  });
  const [error, setError] = useState<string | null>(null);
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Check mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Fetch withdrawal requests from Firebase
  useEffect(() => {
    console.log('🔍 Starting to fetch withdrawal requests from Firebase...');
    const transactionsRef = ref(database, 'transactions');
    
    const handleValueChange = async (snapshot: any) => {
      console.log('📨 Firebase snapshot received:', snapshot.exists());
      
      if (snapshot.exists()) {
        const allTransactions: Transaction[] = [];
        const transactionData = snapshot.val();
        
        console.log('📊 Raw transactions data structure:', Object.keys(transactionData));
        
        // Iterate through all user transactions
        Object.keys(transactionData).forEach(userId => {
          const userTransactions = transactionData[userId];
          console.log(`👤 User ${userId} has ${Object.keys(userTransactions).length} transactions`);
          
          Object.keys(userTransactions).forEach(transactionId => {
            const transaction = userTransactions[transactionId];
            
            // Make sure we have all required fields and it's a withdrawal
            if (transaction.type === 'withdrawal') {
              // Enhanced transaction parsing to handle different field names
              const withdrawalTransaction: Transaction = {
                id: transactionId,
                userId: userId,
                type: transaction.type,
                amount: Math.abs(transaction.amount) || 0, // Withdrawals are negative, take absolute value
                description: transaction.description || 'Withdrawal request',
                status: transaction.status || 'pending',
                // Try multiple possible field names for account number and method
                method: transaction.method || transaction.paymentMethod,
                accountNumber: transaction.accountNumber || transaction.accountDetails,
                paymentMethod: transaction.paymentMethod || transaction.method,
                accountDetails: transaction.accountDetails || transaction.accountNumber,
                createdAt: transaction.createdAt || transaction.timestamp ? new Date(transaction.timestamp).toISOString() : new Date().toISOString(),
                timestamp: transaction.timestamp,
                processedAt: transaction.processedAt,
                rejectionReason: transaction.rejectionReason
              };
              
              console.log(`💳 Found withdrawal: ${withdrawalTransaction.id} for user ${withdrawalTransaction.userId}`, {
                amount: withdrawalTransaction.amount,
                status: withdrawalTransaction.status,
                method: withdrawalTransaction.method,
                accountNumber: withdrawalTransaction.accountNumber,
                paymentMethod: withdrawalTransaction.paymentMethod,
                accountDetails: withdrawalTransaction.accountDetails
              });
              allTransactions.push(withdrawalTransaction);
            }
          });
        });

        console.log(`🎯 Total withdrawal transactions found: ${allTransactions.length}`, allTransactions);

        if (allTransactions.length === 0) {
          console.log('❌ No withdrawal transactions found in Firebase. Checking transaction structure...');
          // Log sample transaction structure for debugging
          Object.keys(transactionData).slice(0, 2).forEach(userId => {
            const userTransactions = transactionData[userId];
            const firstTransactionKey = Object.keys(userTransactions)[0];
            const firstTransaction = userTransactions[firstTransactionKey];
            console.log(`📝 Sample transaction structure for user ${userId}:`, firstTransaction);
          });
        }

        // Sort by timestamp (newest first)
        const sortedTransactions = allTransactions.sort(
          (a, b) => (b.timestamp || new Date(b.createdAt).getTime()) - (a.timestamp || new Date(a.createdAt).getTime())
        );

        // Fetch user data for each transaction
        try {
          const transactionsWithUserData = await Promise.all(
            sortedTransactions.map(async (transaction) => {
              try {
                console.log(`🔍 Fetching user data for user ${transaction.userId}`);
                const userRef = ref(database, `users/${transaction.userId}`);
                const userSnapshot = await get(userRef);
                
                if (userSnapshot.exists()) {
                  const userData = userSnapshot.val() as UserData;
                  
                  return {
                    ...transaction,
                    user: {
                      firstName: userData.firstName || 'Unknown',
                      lastName: userData.lastName || '',
                      username: userData.username || ''
                    }
                  };
                } else {
                  console.log(`❌ No user data found for ${transaction.userId}`);
                  return {
                    ...transaction,
                    user: {
                      firstName: 'Unknown',
                      lastName: '',
                      username: ''
                    }
                  };
                }
              } catch (userError) {
                console.error(`💥 Error fetching user data for ${transaction.userId}:`, userError);
                return transaction;
              }
            })
          );

          console.log('✅ Final transactions with user data:', transactionsWithUserData);
          setWithdrawalRequests(transactionsWithUserData);
          calculateStats(transactionsWithUserData);
          setError(null);
        } catch (fetchError) {
          console.error('💥 Error fetching user data:', fetchError);
          setError('Error loading user details');
          setWithdrawalRequests(sortedTransactions);
          calculateStats(sortedTransactions);
        }
      } else {
        console.log('❌ No transactions found in Firebase at /transactions path');
        // If no data in Firebase, use the mock transactions from props
        console.log('🔄 Using transactions from props:', transactions);
        setWithdrawalRequests(transactions);
        calculateStats(transactions);
        setError('No withdrawal requests found in database');
      }
      setLoading(false);
    };

    const handleError = (error: any) => {
      console.error('💥 Firebase error:', error);
      setError(`Failed to load withdrawal requests: ${error.message}`);
      setLoading(false);
    };

    onValue(transactionsRef, handleValueChange, handleError);

    return () => {
      off(transactionsRef, 'value', handleValueChange);
    };
  }, [transactions]);

  const calculateStats = (transactions: Transaction[]) => {
    const pending = transactions.filter(t => t.status === 'pending').length;
    const completed = transactions.filter(t => t.status === 'completed').length;
    const rejected = transactions.filter(t => t.status === 'rejected' || t.status === 'failed').length;
    const totalAmount = transactions
      .filter(t => t.status === 'pending')
      .reduce((sum, t) => sum + t.amount, 0);

    setStats({
      totalPending: pending,
      totalCompleted: completed,
      totalRejected: rejected,
      totalAmount: totalAmount
    });

    console.log(`📊 Stats updated - Pending: ${pending}, Completed: ${completed}, Rejected: ${rejected}, Total Amount: ${totalAmount}`);
  };

  // Helper function to get display account info
  const getAccountDisplayInfo = (transaction: Transaction) => {
    // Try multiple possible field names
    const accountNumber = transaction.accountNumber || transaction.accountDetails;
    const method = transaction.method || transaction.paymentMethod;
    
    return {
      accountNumber,
      method,
      hasAccountInfo: !!accountNumber
    };
  };

  const handleApprove = async (transaction: Transaction) => {
    if (!transaction.userId) {
      alert('Error: User ID not found');
      return;
    }

    setProcessingId(transaction.id);
    
    try {
      const updates = {
        status: 'completed' as const,
        processedAt: new Date().toISOString()
      };

      console.log(`✅ Approving withdrawal ${transaction.id} for user ${transaction.userId}`);

      // Update transaction status in Firebase - FIXED PATH
      const transactionRef = ref(database, `transactions/${transaction.userId}/${transaction.id}`);
      await update(transactionRef, updates);

      // Update user's total withdrawn amount
      const userRef = ref(database, `users/${transaction.userId}`);
      const userSnapshot = await get(userRef);

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val() as UserData;
        const newTotalWithdrawn = (userData.totalWithdrawn || 0) + transaction.amount;
        
        await update(userRef, {
          totalWithdrawn: newTotalWithdrawn
        });
        console.log(`💳 Updated total withdrawn for user ${transaction.userId} to ${newTotalWithdrawn}`);
      }

      // Call the parent component's update handler
      onUpdateTransaction(transaction.id, updates);

      // Update local state
      setWithdrawalRequests(prev => 
        prev.map(t => 
          t.id === transaction.id 
            ? { ...t, ...updates }
            : t
        )
      );

      // Close mobile detail view if open
      if (isMobile) {
        setSelectedTransaction(null);
      }

      // Send notification to user (you can implement Telegram bot notification here)
      await sendNotification(transaction.userId, 'approved', transaction.amount);

      alert('Withdrawal approved successfully!');
      
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      alert('Error approving withdrawal. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (transaction: Transaction) => {
    if (!transaction.userId) {
      alert('Error: User ID not found');
      return;
    }

    setProcessingId(transaction.id);
    
    try {
      const updates = {
        status: 'rejected' as const,
        processedAt: new Date().toISOString(),
        rejectionReason: 'Administrative decision'
      };

      console.log(`❌ Rejecting withdrawal ${transaction.id} for user ${transaction.userId}`);

      // Update transaction status in Firebase - FIXED PATH
      const transactionRef = ref(database, `transactions/${transaction.userId}/${transaction.id}`);
      await update(transactionRef, updates);

      // Refund amount to user's balance
      const userRef = ref(database, `users/${transaction.userId}`);
      const userSnapshot = await get(userRef);

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val() as UserData;
        const newBalance = (userData.balance || 0) + transaction.amount;
        
        await update(userRef, {
          balance: newBalance
        });
        console.log(`💳 Refunded ${transaction.amount} to user ${transaction.userId}, new balance: ${newBalance}`);
      }

      // Call the parent component's update handler
      onUpdateTransaction(transaction.id, updates);

      // Update local state
      setWithdrawalRequests(prev => 
        prev.map(t => 
          t.id === transaction.id 
            ? { ...t, ...updates }
            : t
        )
      );

      // Close mobile detail view if open
      if (isMobile) {
        setSelectedTransaction(null);
      }

      // Send notification to user
      await sendNotification(transaction.userId, 'rejected', transaction.amount);

      alert('Withdrawal rejected and amount refunded to user!');
      
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      alert('Error rejecting withdrawal. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const sendNotification = async (userId: string, action: 'approved' | 'rejected', amount: number) => {
    console.log(`📢 Notification: Withdrawal ${action} for user ${userId}, amount: ${amount}`);
    // Implement your Telegram bot notification logic here
  };

  // Filter and pagination logic
  const filteredRequests = withdrawalRequests.filter(transaction => {
    const matchesSearch = 
      transaction.userId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.user?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.user?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.accountNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredRequests.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    // Scroll to top when changing pages on mobile
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'completed': return 'bg-green-500/20 text-green-300 border-green-500/50';
      case 'rejected': 
      case 'failed': return 'bg-red-500/20 text-red-300 border-red-500/50';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Loader className="w-4 h-4 animate-spin" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': 
      case 'failed': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Mobile Transaction Card Component
  const MobileTransactionCard = ({ transaction }: { transaction: Transaction }) => {
    const { accountNumber, method, hasAccountInfo } = getAccountDisplayInfo(transaction);
    
    return (
      <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 mb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
              <User className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-white">
                {transaction.user?.firstName && transaction.user?.lastName 
                  ? `${transaction.user.firstName} ${transaction.user.lastName}`
                  : `User ${transaction.userId}`
                }
              </div>
              {transaction.user?.username && (
                <div className="text-sm text-blue-400">@{transaction.user.username}</div>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedTransaction(transaction)}
            className="p-2 hover:bg-gray-700/50 rounded-xl transition-colors"
          >
            <MoreVertical className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Amount and Method */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-bold text-xl text-white">
              {walletConfig.currencySymbol}
              {transaction.amount.toFixed(2)}
            </div>
            <div className="text-sm text-gray-400">{walletConfig.currency}</div>
          </div>
          <div className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border ${getStatusColor(transaction.status)}`}>
            {getStatusIcon(transaction.status)}
            <span className="text-sm font-medium">
              {getStatusText(transaction.status)}
            </span>
          </div>
        </div>

        {/* Account Details */}
        {hasAccountInfo && (
          <div className="space-y-2 mb-3">
            {method && (
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-400">
                  Method: <span className="text-white font-medium">{method}</span>
                </span>
              </div>
            )}
            {accountNumber && (
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-400 font-mono break-all">
                  Account: {accountNumber}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className="text-sm text-gray-300 mb-3">
          {transaction.description}
        </div>

        {/* Date */}
        <div className="flex items-center space-x-2 text-sm text-gray-400 mb-4">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(transaction.createdAt)}</span>
        </div>

        {/* Actions for pending transactions */}
        {transaction.status === 'pending' && (
          <div className="flex space-x-3">
            <button
              onClick={() => handleApprove(transaction)}
              disabled={processingId === transaction.id}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingId === transaction.id ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>{processingId === transaction.id ? 'Processing...' : 'Approve'}</span>
            </button>
            <button
              onClick={() => handleReject(transaction)}
              disabled={processingId === transaction.id}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingId === transaction.id ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span>{processingId === transaction.id ? 'Processing...' : 'Reject'}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Mobile Detail View
  const MobileDetailView = ({ transaction }: { transaction: Transaction }) => {
    const { accountNumber, method, hasAccountInfo } = getAccountDisplayInfo(transaction);
    
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 p-4 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSelectedTransaction(null)}
            className="p-3 hover:bg-gray-700/50 rounded-2xl transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white">Transaction Details</h2>
          <div className="w-10"></div>
        </div>

        <div className="bg-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 mb-6">
          {/* User Info */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
              <User className="w-8 h-8 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-white text-lg">
                {transaction.user?.firstName && transaction.user?.lastName 
                  ? `${transaction.user.firstName} ${transaction.user.lastName}`
                  : `User ${transaction.userId}`
                }
              </div>
              {transaction.user?.username && (
                <div className="text-blue-400 text-sm">@{transaction.user.username}</div>
              )}
              <div className="text-gray-400 text-sm mt-1">User ID: {transaction.userId}</div>
            </div>
          </div>

          {/* Amount and Status */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-700/50 rounded-xl p-4">
              <div className="text-gray-400 text-sm mb-1">Amount</div>
              <div className="font-bold text-2xl text-white">
                {walletConfig.currencySymbol}
                {transaction.amount.toFixed(2)}
              </div>
              <div className="text-gray-400 text-sm">{walletConfig.currency}</div>
            </div>
            <div className="bg-gray-700/50 rounded-xl p-4">
              <div className="text-gray-400 text-sm mb-1">Status</div>
              <div className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg border ${getStatusColor(transaction.status)}`}>
                {getStatusIcon(transaction.status)}
                <span className="text-sm font-medium">
                  {getStatusText(transaction.status)}
                </span>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <div className="space-y-4">
            <div>
              <div className="text-gray-400 text-sm mb-1">Description</div>
              <div className="text-white font-medium">
                {transaction.description}
              </div>
            </div>
            
            {hasAccountInfo && (
              <>
                {method && (
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Payment Method</div>
                    <div className="text-white font-medium">{method}</div>
                  </div>
                )}
                
                {accountNumber && (
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Account Number</div>
                    <div className="text-white font-mono break-all bg-gray-700/50 p-2 rounded-lg">
                      {accountNumber}
                    </div>
                  </div>
                )}
              </>
            )}

            {!hasAccountInfo && (
              <div className="text-yellow-400 text-sm">
                ⚠️ No account details provided
              </div>
            )}

            <div>
              <div className="text-gray-400 text-sm mb-1">Created</div>
              <div className="text-white">{formatDate(transaction.createdAt)}</div>
            </div>

            {transaction.processedAt && (
              <div>
                <div className="text-gray-400 text-sm mb-1">Processed</div>
                <div className="text-white">{formatDate(transaction.processedAt)}</div>
              </div>
            )}

            {transaction.rejectionReason && (
              <div>
                <div className="text-gray-400 text-sm mb-1">Rejection Reason</div>
                <div className="text-red-400">{transaction.rejectionReason}</div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {transaction.status === 'pending' && (
          <div className="flex space-x-3">
            <button
              onClick={() => handleApprove(transaction)}
              disabled={processingId === transaction.id}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-2xl font-semibold text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingId === transaction.id ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              <span>{processingId === transaction.id ? 'Processing...' : 'Approve'}</span>
            </button>
            <button
              onClick={() => handleReject(transaction)}
              disabled={processingId === transaction.id}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-2xl font-semibold text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingId === transaction.id ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
              <span>{processingId === transaction.id ? 'Processing...' : 'Reject'}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-white text-lg font-medium">Loading withdrawal requests...</div>
          <div className="text-gray-400 text-sm">Checking database...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/50">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-white text-lg font-medium">Error Loading Data</div>
          <div className="text-gray-400 text-sm">{error}</div>
          <div className="text-gray-500 text-xs mt-4">
            Please check:
            <ul className="mt-2 space-y-1 text-left">
              <li>• Database connection</li>
              <li>• Firebase rules</li>
              <li>• Transaction data structure</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Mobile Detail View Overlay
  if (isMobile && selectedTransaction) {
    return <MobileDetailView transaction={selectedTransaction} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-xl border-b border-gray-700/50 px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Withdrawal Requests
              </h1>
              <p className="text-gray-400 mt-1 text-sm sm:text-base">
                Manage and process user withdrawal requests
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Info - Remove in production */}
      <div className="px-4 sm:px-6 py-2">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="text-blue-300 text-sm flex flex-wrap gap-4">
            <span><strong>Total Requests:</strong> {withdrawalRequests.length}</span>
            <span><strong>Filtered:</strong> {filteredRequests.length}</span>
            <span><strong>Status:</strong> {statusFilter}</span>
            <span><strong>With Account Info:</strong> {withdrawalRequests.filter(t => getAccountDisplayInfo(t).hasAccountInfo).length}</span>
            <span><strong>db:</strong> Connected</span>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/20 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-yellow-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-yellow-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2">Pending</div>
                <div className="text-xl sm:text-3xl font-bold text-white">{stats.totalPending}</div>
                <div className="text-gray-400 text-xs sm:text-sm mt-1">Awaiting approval</div>
              </div>
              <div className="p-2 sm:p-3 bg-yellow-500/20 rounded-xl">
                <Loader className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-400 animate-spin" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/20 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-green-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-green-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2">Completed</div>
                <div className="text-xl sm:text-3xl font-bold text-white">{stats.totalCompleted}</div>
                <div className="text-gray-400 text-xs sm:text-sm mt-1">Approved requests</div>
              </div>
              <div className="p-2 sm:p-3 bg-green-500/20 rounded-xl">
                <CheckCircle className="w-4 h-4 sm:w-6 sm:h-6 text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/20 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-red-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-red-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2">Rejected</div>
                <div className="text-xl sm:text-3xl font-bold text-white">{stats.totalRejected}</div>
                <div className="text-gray-400 text-xs sm:text-sm mt-1">Rejected requests</div>
              </div>
              <div className="p-2 sm:p-3 bg-red-500/20 rounded-xl">
                <XCircle className="w-4 h-4 sm:w-6 sm:h-6 text-red-400" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/20 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-blue-500/20 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-blue-400 text-xs sm:text-sm font-semibold mb-1 sm:mb-2">Total Amount</div>
                <div className="text-xl sm:text-3xl font-bold text-white">
                  {walletConfig.currencySymbol}
                  {stats.totalAmount.toFixed(2)}
                </div>
                <div className="text-gray-400 text-xs sm:text-sm mt-1">Pending total</div>
              </div>
              <div className="p-2 sm:p-3 bg-blue-500/20 rounded-xl">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-blue-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-4 sm:px-6 pb-6">
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/20 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-gray-700/50 shadow-lg">
          {/* Mobile Filter Toggle */}
          {isMobile && (
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white mb-4"
            >
              <Filter className="w-5 h-5" />
              <span>Filters & Search</span>
            </button>
          )}

          <div className={`${isMobile ? (showMobileFilters ? 'block' : 'hidden') : 'flex flex-col lg:flex-row gap-6'}`}>
            {/* Search */}
            <div className="flex-1 mb-4 lg:mb-0">
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by user ID, name, username, or account number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 backdrop-blur-xl text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-3">
              {!isMobile && <Filter className="w-5 h-5 text-gray-400" />}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full lg:w-auto bg-gray-700/50 border border-gray-600/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 backdrop-blur-xl text-sm sm:text-base"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Withdrawal Requests */}
      <div className="px-4 sm:px-6 pb-8">
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/20 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-lg overflow-hidden">
          {currentItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 border border-gray-600/50">
                <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-gray-500" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-400 mb-3">
                No withdrawal requests found
              </h3>
              <p className="text-gray-500 max-w-md mx-auto text-sm sm:text-base px-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filters to find what you are looking for.'
                  : 'All withdrawal requests have been processed. New requests will appear here.'}
              </p>
            </div>
          ) : isMobile ? (
            // Mobile View - Cards
            <div className="p-4">
              {currentItems.map((transaction) => (
                <MobileTransactionCard 
                  key={transaction.id} 
                  transaction={transaction} 
                />
              ))}
            </div>
          ) : (
            // Desktop View - Table
            <>
              <div className="overflow-x-auto whitespace-nowrap">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700/50 bg-gray-800/30">
                      <th className="px-4 sm:px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        User Details
                      </th>
                      <th className="px-4 sm:px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        Amount & Method
                      </th>
                      <th className="px-4 sm:px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        Account Details
                      </th>
                      <th className="px-4 sm:px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 sm:px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th className="px-4 sm:px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/30">
                    {currentItems.map((transaction) => {
                      const { accountNumber, method, hasAccountInfo } = getAccountDisplayInfo(transaction);
                      
                      return (
                        <tr 
                          key={transaction.id} 
                          className="hover:bg-gray-700/20 transition-all duration-200 group"
                        >
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center space-x-3 sm:space-x-4">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                                <User className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <div className="font-semibold text-white group-hover:text-blue-300 transition-colors text-sm sm:text-base">
                                    {transaction.user?.firstName && transaction.user?.lastName 
                                      ? `${transaction.user.firstName} ${transaction.user.lastName}`
                                      : `User ${transaction.userId}`
                                    }
                                  </div>
                                </div>
                                <div className="text-xs sm:text-sm text-gray-400 mt-1 truncate">
                                  User ID: {transaction.userId}
                                </div>
                                {transaction.user?.username && (
                                  <div className="text-xs sm:text-sm text-blue-400 mt-1">
                                    @{transaction.user.username}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <div className="font-bold text-lg sm:text-xl text-white">
                                  {walletConfig.currencySymbol}
                                  {transaction.amount.toFixed(2)}
                                </div>
                                <span className="text-xs sm:text-sm text-gray-400 px-2 py-1 bg-gray-700/50 rounded-lg">
                                  {walletConfig.currency}
                                </span>
                              </div>
                              {method && (
                                <div className="text-xs sm:text-sm text-blue-400 font-medium">
                                  {method}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            {hasAccountInfo ? (
                              <div className="space-y-1">
                                {accountNumber && (
                                  <div className="text-xs sm:text-sm text-white font-mono break-all bg-gray-700/50 p-2 rounded-lg border border-gray-600/50">
                                    {accountNumber}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs sm:text-sm italic">
                                No account details
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className={`inline-flex items-center space-x-2 px-3 py-2 rounded-xl border ${getStatusColor(transaction.status)}`}>
                              {getStatusIcon(transaction.status)}
                              <span className="text-sm font-medium">
                                {getStatusText(transaction.status)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-400">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(transaction.createdAt)}</span>
                            </div>
                            {transaction.processedAt && (
                              <div className="text-xs text-gray-500 mt-1">
                                Processed: {formatDate(transaction.processedAt)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            {transaction.status === 'pending' && (
                              <div className="flex space-x-2 sm:space-x-3">
                                <button
                                  onClick={() => handleApprove(transaction)}
                                  disabled={processingId === transaction.id}
                                  className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 shadow-lg shadow-green-500/20"
                                >
                                  {processingId === transaction.id ? (
                                    <Loader className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                                  )}
                                  <span>
                                    {processingId === transaction.id ? 'Processing...' : 'Approve'}
                                  </span>
                                </button>
                                <button
                                  onClick={() => handleReject(transaction)}
                                  disabled={processingId === transaction.id}
                                  className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 shadow-lg shadow-red-500/20"
                                >
                                  {processingId === transaction.id ? (
                                    <Loader className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                  ) : (
                                    <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                                  )}
                                  <span>
                                    {processingId === transaction.id ? 'Processing...' : 'Reject'}
                                  </span>
                                </button>
                              </div>
                            )}
                            {transaction.status !== 'pending' && (
                              <span className="text-gray-500 text-xs sm:text-sm italic">
                                Already processed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center py-4 sm:py-6 border-t border-gray-700/50 bg-gray-800/30">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-700/50 border border-gray-600/50 text-white rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 hover:bg-gray-600/50 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    >
                      <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>Prev</span>
                    </button>
                    <span className="text-gray-300 text-xs sm:text-sm font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-700/50 border border-gray-600/50 text-white rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 hover:bg-gray-600/50 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    >
                      <span>Next</span>
                      <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 transform rotate-180" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Withdrawal;
