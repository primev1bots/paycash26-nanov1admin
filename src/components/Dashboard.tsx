import React, { useState, useEffect } from 'react';
import { ref, get, update, onValue, off, push, set, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase';
import { Users, DollarSign, TrendingUp, Clock, Search, Edit, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Download, Coins, Eye, UserCheck } from 'lucide-react';

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
  totalAdsWatched: number;
  tasksCompleted: Record<string, number>;
  lastAdWatch?: string;
  referredBy?: string;
  deviceId?: string;
  isMainAccount?: boolean;
  lastActive: string;
  adsHistory?: {
    [timestamp: string]: {
      provider: string;
      reward: number;
      type: string;
    };
  };
  stats?: {
    [date: string]: {
      ads: number;
      earned: number;
    };
  };
}

interface Transaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  method?: string;
  accountNumber?: string;
  accountDetails?: string;
  paymentMethod?: string;
  createdAt: string;
  timestamp?: number;
}

interface AdminStats {
  totalUsers: number;
  totalWithdrawn: number;
  totalEarnings: number;
  pendingWithdrawals: number;
  activeUsers: number; // Added active users count
}

interface WalletConfig {
  currency: string;
  currencySymbol: string;
  defaultMinWithdrawal: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

interface EarningsHistory {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  source?: string;
  status?: string;
  timestamp?: number;
}

// Define props interface for AdminPanel
interface AdminPanelProps {
  transactions?: Transaction[];
  onUpdateTransaction?: (transactionId: string, updates: Partial<Transaction>) => void;
  walletConfig?: WalletConfig;
}

const Dashboard: React.FC<AdminPanelProps> = ({ 
  }) => {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalWithdrawn: 0,
    totalEarnings: 0,
    pendingWithdrawals: 0,
    activeUsers: 0 // Initialize active users
  });
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceAction, setBalanceAction] = useState<'add' | 'deduct'>('add');
  const [balanceDescription, setBalanceDescription] = useState('');
  
  // Earnings History State
  const [earningsHistory, setEarningsHistory] = useState<EarningsHistory[]>([]);
  const [filteredEarnings, setFilteredEarnings] = useState<EarningsHistory[]>([]);
  const [earningsFilter, setEarningsFilter] = useState<string>('all');
  const [isLoadingEarnings, setIsLoadingEarnings] = useState(false);
  const [showEarningsHistory, setShowEarningsHistory] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);

  // Earnings pagination
  const [earningsCurrentPage, setEarningsCurrentPage] = useState(1);
  const [earningsPerPage, setEarningsPerPage] = useState(10);

  // Active users tracking
  const [, setActiveUsersCount] = useState(0);

  // Load admin data
  useEffect(() => {
    loadAdminData();
    setupRealtimeListeners();

    return () => {
      cleanupListeners();
    };
  }, []);

  // Filter users based on search
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user => {
        const searchLower = searchTerm.toLowerCase().trim();
        
        // Search in username (handle undefined)
        const usernameMatch = user.username?.toLowerCase().includes(searchLower) || false;
        
        // Search in first name (handle undefined)
        const firstNameMatch = user.firstName?.toLowerCase().includes(searchLower) || false;
        
        // Search in last name (handle undefined)
        const lastNameMatch = user.lastName?.toLowerCase().includes(searchLower) || false;
        
        // Search in full name combination
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase().trim();
        const fullNameMatch = fullName.includes(searchLower);
        
        // Search in Telegram ID
        const telegramIdMatch = user.telegramId.toString().includes(searchTerm);
        
        return usernameMatch || firstNameMatch || lastNameMatch || fullNameMatch || telegramIdMatch;
      });
      setFilteredUsers(filtered);
    }
    setCurrentPage(1); // Reset to first page when search changes
  }, [searchTerm, users]);

  // Filter earnings based on selected filter
  useEffect(() => {
    if (earningsFilter === 'all') {
      setFilteredEarnings(earningsHistory);
    } else {
      const filtered = earningsHistory.filter(earning => 
        earning.type.toLowerCase().includes(earningsFilter.toLowerCase())
      );
      setFilteredEarnings(filtered);
    }
    setEarningsCurrentPage(1);
  }, [earningsHistory, earningsFilter]);

  // Load earnings history when user is selected
  useEffect(() => {
    if (selectedUser) {
      loadEarningsHistory(selectedUser.telegramId);
    }
  }, [selectedUser]);

  // Calculate active users whenever users data changes
  useEffect(() => {
    calculateActiveUsers(users);
  }, [users]);

  // Function to calculate active users (last 24 hours)
  const calculateActiveUsers = (usersData: UserData[]) => {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const activeUsers = usersData.filter(user => {
      if (!user.lastActive) return false;
      
      const lastActiveTime = new Date(user.lastActive).getTime();
      return lastActiveTime >= twentyFourHoursAgo;
    }).length;

    setActiveUsersCount(activeUsers);
    setStats(prev => ({ ...prev, activeUsers }));
  };

  // Pagination calculations for users
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  // Pagination calculations for earnings
  const totalEarningsPages = Math.ceil(filteredEarnings.length / earningsPerPage);
  const indexOfLastEarning = earningsCurrentPage * earningsPerPage;
  const indexOfFirstEarning = indexOfLastEarning - earningsPerPage;
  const currentEarnings = filteredEarnings.slice(indexOfFirstEarning, indexOfLastEarning);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToEarningsPage = (page: number) => {
    if (page >= 1 && page <= totalEarningsPages) {
      setEarningsCurrentPage(page);
    }
  };

  const handleUsersPerPageChange = (value: number) => {
    setUsersPerPage(value);
    setCurrentPage(1);
  };

  const handleEarningsPerPageChange = (value: number) => {
    setEarningsPerPage(value);
    setEarningsCurrentPage(1);
  };

  // Generate page numbers for pagination with ellipsis
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = window.innerWidth < 768 ? 3 : 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      const startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      if (startPage > 1) {
        pageNumbers.push(1);
        if (startPage > 2) pageNumbers.push('...');
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }
      
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageNumbers.push('...');
        pageNumbers.push(totalPages);
      }
    }
    
    return pageNumbers;
  };

  const getEarningsPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = window.innerWidth < 768 ? 3 : 5;
    
    if (totalEarningsPages <= maxVisiblePages) {
      for (let i = 1; i <= totalEarningsPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      const startPage = Math.max(1, earningsCurrentPage - Math.floor(maxVisiblePages / 2));
      const endPage = Math.min(totalEarningsPages, startPage + maxVisiblePages - 1);
      
      if (startPage > 1) {
        pageNumbers.push(1);
        if (startPage > 2) pageNumbers.push('...');
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }
      
      if (endPage < totalEarningsPages) {
        if (endPage < totalEarningsPages - 1) pageNumbers.push('...');
        pageNumbers.push(totalEarningsPages);
      }
    }
    
    return pageNumbers;
  };

  const setupRealtimeListeners = () => {
    // Users listener
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const usersData: UserData[] = [];
        snapshot.forEach((childSnapshot) => {
          usersData.push(childSnapshot.val());
        });
        setUsers(usersData);
        calculateStats(usersData);
        calculateActiveUsers(usersData); // Calculate active users when users data changes
      }
    });

    // Transactions listener for pending withdrawals
    const transactionsRef = ref(database, 'transactions');
    onValue(transactionsRef, (snapshot) => {
      if (snapshot.exists()) {
        let pendingWithdrawals = 0;
        snapshot.forEach((childSnapshot) => {
          const transaction = childSnapshot.val();
          if (transaction.type === 'withdrawal' && transaction.status === 'pending') {
            pendingWithdrawals += transaction.amount;
          }
        });
        setStats(prev => ({ ...prev, pendingWithdrawals }));
      }
    });
  };

  const cleanupListeners = () => {
    const usersRef = ref(database, 'users');
    off(usersRef);
    
    const transactionsRef = ref(database, 'transactions');
    off(transactionsRef);
  };

  const calculateStats = (usersData: UserData[]) => {
    const totalWithdrawn = usersData.reduce((sum, user) => sum + (user.totalWithdrawn || 0), 0);
    const totalEarnings = usersData.reduce((sum, user) => sum + (user.totalEarned || 0), 0);
    
    setStats(prev => ({
      ...prev,
      totalUsers: usersData.length,
      totalWithdrawn,
      totalEarnings
    }));
  };

  const loadAdminData = async () => {
    try {
      // Load users
      const usersRef = ref(database, 'users');
      const usersSnapshot = await get(usersRef);
      
      if (usersSnapshot.exists()) {
        const usersData: UserData[] = [];
        usersSnapshot.forEach((childSnapshot) => {
          usersData.push(childSnapshot.val());
        });
        setUsers(usersData);
        calculateStats(usersData);
        calculateActiveUsers(usersData); // Calculate active users on initial load
      }

      // Load pending withdrawals
      const transactionsRef = ref(database, 'transactions');
      const transactionsSnapshot = await get(transactionsRef);
      
      if (transactionsSnapshot.exists()) {
        let pendingWithdrawals = 0;
        transactionsSnapshot.forEach((childSnapshot) => {
          const transaction = childSnapshot.val();
          if (transaction.type === 'withdrawal' && transaction.status === 'pending') {
            pendingWithdrawals += transaction.amount;
          }
        });
        setStats(prev => ({ ...prev, pendingWithdrawals }));
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    }
  };

  const loadEarningsHistory = async (userId: number) => {
  setIsLoadingEarnings(true);
  try {
    console.log('Loading earnings history for user:', userId);
    
    // Try user-based structure first
    const userTransactionsRef = ref(database, `transactions/${userId}`);
    const snapshot = await get(userTransactionsRef);
    
    console.log('User transactions snapshot exists:', snapshot.exists());
    
    const earnings: EarningsHistory[] = [];

    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const transaction = childSnapshot.val();
        console.log('Found user transaction:', transaction);
        
        // Include all earning transaction types (positive amounts)
        if (transaction.amount > 0 && [
          'claim', 
          'ad_reward', 
          'task_reward', 
          'referral', 
          'referral_commission',
          'admin_add'
        ].includes(transaction.type)) {
          console.log('Adding earning transaction:', transaction.type, transaction.amount);
          earnings.push({
            id: childSnapshot.key || '',
            type: transaction.type,
            amount: transaction.amount,
            description: transaction.description,
            date: transaction.createdAt || new Date(transaction.timestamp || Date.now()).toISOString(),
            source: transaction.source,
            status: transaction.status,
            timestamp: transaction.timestamp || new Date(transaction.createdAt).getTime()
          });
        }
      });
    } else {
      console.log('No user-based transactions found, trying flat structure...');
      // Fallback to flat structure
      const transactionsRef = ref(database, 'transactions');
      const userTransactionsQuery = query(
        transactionsRef,
        orderByChild('userId'),
        equalTo(userId.toString())
      );
      
      const flatSnapshot = await get(userTransactionsQuery);
      console.log('Flat transactions snapshot exists:', flatSnapshot.exists());
      
      if (flatSnapshot.exists()) {
        flatSnapshot.forEach((childSnapshot) => {
          const transaction = childSnapshot.val();
          console.log('Found flat transaction:', transaction);
          
          if (transaction.amount > 0 && [
            'claim', 
            'ad_reward', 
            'task_reward', 
            'referral', 
            'referral_commission',
            'admin_add'
          ].includes(transaction.type)) {
            console.log('Adding earning transaction:', transaction.type, transaction.amount);
            earnings.push({
              id: childSnapshot.key || '',
              type: transaction.type,
              amount: transaction.amount,
              description: transaction.description,
              date: transaction.createdAt || new Date(transaction.timestamp || Date.now()).toISOString(),
              source: transaction.source,
              status: transaction.status,
              timestamp: transaction.timestamp || new Date(transaction.createdAt).getTime()
            });
          }
        });
      }
    }

    // Sort by date, most recent first
    earnings.sort((a, b) => {
      const dateA = a.timestamp || new Date(a.date).getTime();
      const dateB = b.timestamp || new Date(b.date).getTime();
      return dateB - dateA;
    });
    
    console.log('Final earnings array:', earnings);
    setEarningsHistory(earnings);
  } catch (error) {
    console.error('Error loading earnings history:', error);
  } finally {
    setIsLoadingEarnings(false);
  }
};

  const handleEditUser = async (user: UserData) => {
    setSelectedUser(user);
    setBalanceAmount('');
    setBalanceDescription('');
    setBalanceAction('add');
    setEarningsHistory([]);
    setEarningsFilter('all');
    setShowEarningsHistory(false);
  };

  const handleCloseUserDetails = () => {
    setSelectedUser(null);
    setEarningsHistory([]);
    setShowEarningsHistory(false);
  };

  const handleBalanceUpdate = async () => {
    if (!selectedUser || !balanceAmount || parseFloat(balanceAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const amount = parseFloat(balanceAmount);
      const newBalance = balanceAction === 'add' 
        ? (selectedUser.balance || 0) + amount
        : Math.max(0, (selectedUser.balance || 0) - amount);

      const newTotalEarned = balanceAction === 'add'
        ? (selectedUser.totalEarned || 0) + amount
        : (selectedUser.totalEarned || 0);

      // Update user balance
      await update(ref(database, `users/${selectedUser.telegramId}`), {
        balance: newBalance,
        totalEarned: newTotalEarned
      });

      // Add transaction record
      const transaction: Omit<Transaction, 'id'> = {
        userId: selectedUser.telegramId.toString(),
        type: balanceAction === 'add' ? 'admin_add' : 'admin_deduct',
        amount: amount,
        description: balanceDescription || `Admin ${balanceAction === 'add' ? 'added' : 'deducted'} balance`,
        status: 'completed',
        createdAt: new Date().toISOString()
      };

      const transactionsRef = ref(database, 'transactions');
      const newTransactionRef = push(transactionsRef);
      await set(newTransactionRef, {
        ...transaction,
        id: newTransactionRef.key
      });

      alert(`Balance ${balanceAction === 'add' ? 'added' : 'deducted'} successfully!`);
      setBalanceAmount('');
      setBalanceDescription('');
      
      // Refresh user data and earnings history
      const userRef = ref(database, `users/${selectedUser.telegramId}`);
      const userSnapshot = await get(userRef);
      if (userSnapshot.exists()) {
        setSelectedUser(userSnapshot.val());
      }
      
      // Reload earnings history to show the new transaction
      loadEarningsHistory(selectedUser.telegramId);

    } catch (error) {
      console.error('Error updating balance:', error);
      alert('Error updating balance. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEarningTypeColor = (type: string) => {
    switch (type) {
      case 'ad_reward':
        return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    }
  };

  const getEarningTypeLabel = (type: string) => {
    switch (type) {
      case 'ad_reward':
        return 'Ad Reward';
      default:
        return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getEarningTypeIcon = (type: string) => {
    switch (type) {
      case 'ad_reward':
        return <Eye className="w-4 h-4 text-blue-400" />;
      default:
        return <Coins className="w-4 h-4 text-gray-400" />;
    }
  };

  const exportEarningsToCSV = () => {
    if (!selectedUser || filteredEarnings.length === 0) return;
    
    const headers = ['Date', 'Type', 'Amount', 'Description', 'Status'];
    const csvData = filteredEarnings.map(earning => [
      formatDateTime(earning.date),
      getEarningTypeLabel(earning.type),
      `$${earning.amount.toFixed(2)}`,
      earning.description,
      earning.status || 'completed'
    ]);
    
    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ads-earnings-${selectedUser.telegramId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calculate total ads watched and earnings from ads
  const calculateAdsStats = () => {
    if (!selectedUser) return { totalAds: 0, totalEarningsFromAds: 0 };
    
    const totalAds = filteredEarnings.length;
    const totalEarningsFromAds = filteredEarnings.reduce((sum, earning) => sum + earning.amount, 0);
    
    return { totalAds, totalEarningsFromAds };
  };

  // Earnings History Section - Now only shows ads
  const EarningsHistorySection = () => {
    const adsStats = calculateAdsStats();
    
    return (
      <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-white">Ads History</h3>
            <p className="text-gray-400 text-sm mt-1">
              Total {adsStats.totalAds} ads watched • ${adsStats.totalEarningsFromAds.toFixed(2)} earned from ads
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Filter - Only show ads filter since we only have ads now */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={earningsFilter}
                onChange={(e) => setEarningsFilter(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Ads</option>
                <option value="ad_reward">Ad Rewards</option>
              </select>
            </div>
            
            {/* Export Button */}
            <button
              onClick={exportEarningsToCSV}
              disabled={filteredEarnings.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {isLoadingEarnings ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-400 mt-2">Loading ads history...</p>
          </div>
        ) : filteredEarnings.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Date & Time</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Type</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Amount</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Description</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEarnings.map((earning) => (
                    <tr key={earning.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-300">
                          {formatDateTime(earning.date)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-gray-700 rounded-lg">
                            {getEarningTypeIcon(earning.type)}
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEarningTypeColor(earning.type)}`}>
                            {getEarningTypeLabel(earning.type)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-green-400 font-semibold">
                          +${earning.amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-300 max-w-xs">
                        {earning.description}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          (earning.status === 'completed' || !earning.status) 
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        }`}>
                          {earning.status || 'completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Earnings Pagination */}
            {totalEarningsPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-1">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-400 whitespace-nowrap">
                    Show:
                  </label>
                  <select
                    value={earningsPerPage}
                    onChange={(e) => handleEarningsPerPageChange(Number(e.target.value))}
                    className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-400 whitespace-nowrap">
                    of {filteredEarnings.length} ads
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToEarningsPage(1)}
                    disabled={earningsCurrentPage === 1}
                    className="hidden sm:flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => goToEarningsPage(earningsCurrentPage - 1)}
                    disabled={earningsCurrentPage === 1}
                    className="flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1">
                    {getEarningsPageNumbers().map((pageNumber, index) => (
                      pageNumber === '...' ? (
                        <span key={`ellipsis-${index}`} className="px-2 py-1 text-gray-500">
                          ...
                        </span>
                      ) : (
                        <button
                          key={pageNumber}
                          onClick={() => goToEarningsPage(pageNumber as number)}
                          className={`min-w-[40px] h-10 px-2 rounded-lg transition-all duration-200 ${
                            earningsCurrentPage === pageNumber
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      )
                    ))}
                  </div>

                  <button
                    onClick={() => goToEarningsPage(earningsCurrentPage + 1)}
                    disabled={earningsCurrentPage === totalEarningsPages}
                    className="flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => goToEarningsPage(totalEarningsPages)}
                    disabled={earningsCurrentPage === totalEarningsPages}
                    className="hidden sm:flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="hidden sm:block text-sm text-gray-400 whitespace-nowrap">
                  Page {earningsCurrentPage} of {totalEarningsPages}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No ads history found for this user.</p>
            <p className="text-sm mt-1">Ads history will appear here when the user watches ads.</p>
          </div>
        )}
      </div>
    );
  };

  // Premium Pagination Component for Users
  const Pagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-1">
      {/* Users per page selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400 whitespace-nowrap">
          Show:
        </label>
        <select
          value={usersPerPage}
          onChange={(e) => handleUsersPerPageChange(Number(e.target.value))}
          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-400 whitespace-nowrap">
          of {filteredUsers.length} users
        </span>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {/* First Page Button - Hidden on mobile */}
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="hidden sm:flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Previous Page Button */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Numbers */}
          <div className="flex items-center gap-1">
            {getPageNumbers().map((pageNumber, index) => (
              pageNumber === '...' ? (
                <span key={`ellipsis-${index}`} className="px-2 py-1 text-gray-500">
                  ...
                </span>
              ) : (
                <button
                  key={pageNumber}
                  onClick={() => goToPage(pageNumber as number)}
                  className={`min-w-[40px] h-10 px-2 rounded-lg transition-all duration-200 ${
                    currentPage === pageNumber
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  {pageNumber}
                </button>
              )
            ))}
          </div>

          {/* Next Page Button */}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Last Page Button - Hidden on mobile */}
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className="hidden sm:flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="Last Page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page info - Hidden on mobile */}
      <div className="hidden sm:block text-sm text-gray-400 whitespace-nowrap">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );

  // Mobile User Card Component
  const UserCard = ({ user }: { user: UserData }) => (
    <div className="bg-gray-800 rounded-xl p-4 mb-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-white text-base">
            {user.firstName} {user.lastName}
          </h3>
          <p className="text-gray-400 text-sm">@{user.username}</p>
          <p className="text-gray-400 text-xs mt-1">ID: {user.telegramId}</p>
        </div>
        <button
          onClick={() => handleEditUser(user)}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium shadow-lg shadow-blue-600/25"
        >
          <Edit className="w-3 h-3" />
          Manage
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-400 text-xs">Balance</p>
          <p className="text-green-400 font-semibold">${user.balance?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total Earned</p>
          <p className="text-blue-400 font-semibold">${user.totalEarned?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total Withdrawn</p>
          <p className="text-orange-400 font-semibold">${user.totalWithdrawn?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Total Ads</p>
          <p className="text-purple-400 font-semibold">{user.totalAdsWatched || 0}</p>
        </div>
      </div>
    </div>
  );

  const renderUsersList = () => (
    <div className="bg-gray-800 rounded-xl p-4 mt-6 border border-gray-700">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search users by name, username, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
        />
      </div>

      {/* Users Count */}
      <div className="text-sm text-gray-400 mb-4 px-1">
        Showing {Math.min(currentUsers.length, usersPerPage)} of {filteredUsers.length} users
      </div>

      {/* Users List with Scroll */}
      <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700">
        <div className="space-y-3 p-1">
          {currentUsers.map((user) => (
            <UserCard key={user.telegramId} user={user} />
          ))}

          {currentUsers.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              {searchTerm ? 'No users found matching your search.' : 'No users found.'}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <Pagination />
    </div>
  );

  // Render Users Table for Desktop
  const renderUsersTable = () => (
    <div className="bg-gray-800 rounded-xl p-6 mt-6 border border-gray-700">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search users by name, username, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
          />
        </div>
      </div>

      {/* Users Info */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-400">
          Showing {indexOfFirstUser + 1}-{Math.min(indexOfLastUser, filteredUsers.length)} of {filteredUsers.length} users
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">User</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Chat ID</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Balance</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Total Earned</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Total Withdrawn</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Joined On</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentUsers.map((user) => (
              <tr key={user.telegramId} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td className="py-3 px-4">
                  <div>
                    <div className="font-medium text-white">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-sm text-gray-400">
                      @{user.username}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-300">
                  {user.telegramId}
                </td>
                <td className="py-3 px-4">
                  <span className="text-green-400 font-semibold">
                    ${user.balance?.toFixed(2) || '0.00'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-blue-400 font-semibold">
                    ${user.totalEarned?.toFixed(2) || '0.00'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-orange-400 font-semibold">
                    ${user.totalWithdrawn?.toFixed(2) || '0.00'}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-gray-300">
                  {formatDate(user.joinDate)}
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleEditUser(user)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium shadow-lg shadow-blue-600/25"
                  >
                    <Edit className="w-4 h-4" />
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {currentUsers.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            {searchTerm ? 'No users found matching your search.' : 'No users found.'}
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination />
    </div>
  );

  if (selectedUser) {
    const adsStats = calculateAdsStats();
    
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={handleCloseUserDetails}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all duration-200 border border-gray-600"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Users</span>
                <span className="sm:hidden">Back</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-bold">User Management</h1>
            </div>
            <div className="text-sm text-gray-400 hidden sm:block">
              User ID: {selectedUser.telegramId}
            </div>
          </div>

          {/* User Info Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
              <div className="mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  {selectedUser.firstName} {selectedUser.lastName}
                </h2>
                <p className="text-gray-400">@{selectedUser.username}</p>
                <p className="text-gray-400 text-sm mt-1 sm:hidden">
                  User ID: {selectedUser.telegramId}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Balance</p>
                  <p className="text-green-400 font-bold text-lg">
                    ${selectedUser.balance?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Total Earned</p>
                  <p className="text-blue-400 font-bold">
                    ${selectedUser.totalEarned?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Total Withdrawn</p>
                  <p className="text-orange-400 font-bold">
                    ${selectedUser.totalWithdrawn?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Total Ads Watched</p>
                  <p className="text-purple-400 font-bold">
                    {adsStats.totalAds}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Ads Today</p>
                  <p className="text-cyan-400 font-bold">
                    {selectedUser.adsWatchedToday || 0}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Earned from Ads</p>
                  <p className="text-green-400 font-bold">
                    ${adsStats.totalEarningsFromAds.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Joined</p>
                  <p className="text-gray-300">
                    {formatDate(selectedUser.joinDate)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Last Active</p>
                  <p className="text-gray-300 text-xs">
                    {selectedUser.lastActive ? formatDateTime(selectedUser.lastActive) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Earnings History Button */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowEarningsHistory(!showEarningsHistory)}
                  className="flex items-center gap-2 w-full bg-purple-600 hover:bg-purple-700 px-4 py-3 rounded-lg transition-all duration-200 text-white font-medium"
                >
                  <Eye className="w-4 h-4" />
                  {showEarningsHistory ? 'Hide Ads History' : 'Show Ads History'}
                </button>
              </div>
            </div>

            {/* Balance Management */}
            <div className="lg:col-span-2 bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-white">Balance Management</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Action
                  </label>
                  <select
                    value={balanceAction}
                    onChange={(e) => setBalanceAction(e.target.value as 'add' | 'deduct')}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                  >
                    <option value="add">Add Balance</option>
                    <option value="deduct">Deduct Balance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                    step="0.01"
                    min="0.01"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={balanceDescription}
                  onChange={(e) => setBalanceDescription(e.target.value)}
                  placeholder="Enter description"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                />
              </div>
              <button
                onClick={handleBalanceUpdate}
                disabled={!balanceAmount || parseFloat(balanceAmount) <= 0}
                className={`w-full py-3 rounded-lg font-bold transition-all duration-200 ${
                  !balanceAmount || parseFloat(balanceAmount) <= 0
                    ? 'bg-gray-600 cursor-not-allowed border border-gray-500'
                    : balanceAction === 'add'
                    ? 'bg-green-600 hover:bg-green-700 border border-green-500 shadow-lg shadow-green-600/25'
                    : 'bg-red-600 hover:bg-red-700 border border-red-500 shadow-lg shadow-red-600/25'
                }`}
              >
                {balanceAction === 'add' ? 'Add Balance' : 'Deduct Balance'}
              </button>
            </div>
          </div>

          {/* Earnings History Section - Now shows only ads */}
          {showEarningsHistory && <EarningsHistorySection />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6 mb-6 sm:mb-8">
          {/* Total Users */}
          <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Total Users</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white">{stats.totalUsers}</p>
              </div>
              <div className="p-2 sm:p-3 bg-blue-500/20 rounded-lg">
                <Users className="w-4 h-4 sm:w-6 sm:h-6 text-blue-400" />
              </div>
            </div>
          </div>

          {/* Active Users (NEW) */}
          <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Active Users (24h)</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white">{stats.activeUsers}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {stats.totalUsers > 0 ? `${((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)}% active` : '0% active'}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-green-500/20 rounded-lg">
                <UserCheck className="w-4 h-4 sm:w-6 sm:h-6 text-green-400" />
              </div>
            </div>
          </div>

          {/* Total Withdrawn */}
          <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Total Withdrawn</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white">${stats.totalWithdrawn.toFixed(2)}</p>
              </div>
              <div className="p-2 sm:p-3 bg-orange-500/20 rounded-lg">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-orange-400" />
              </div>
            </div>
          </div>

          {/* Total Earnings */}
          <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Total Earnings</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white">${stats.totalEarnings.toFixed(2)}</p>
              </div>
              <div className="p-2 sm:p-3 bg-purple-500/20 rounded-lg">
                <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6 text-purple-400" />
              </div>
            </div>
          </div>

          {/* Pending Withdrawals */}
          <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Pending Withdrawals</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white">${stats.pendingWithdrawals.toFixed(2)}</p>
              </div>
              <div className="p-2 sm:p-3 bg-yellow-500/20 rounded-lg">
                <Clock className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Users Table/List - Show table on desktop, cards on mobile */}
        <div className="hidden md:block">
          {renderUsersTable()}
        </div>
        <div className="block md:hidden">
          {renderUsersList()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
