import React, { useState, useEffect } from 'react';
import { ref, get, update, onValue, off, push, set, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase';
import { Users, DollarSign, TrendingUp, Clock, Search, Edit, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye } from 'lucide-react';

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
  referredBy?: string;
  deviceId?: string;
  isMainAccount?: boolean;
}

interface AdminStats {
  totalUsers: number;
  totalWithdrawn: number;
  totalEarnings: number;
  pendingWithdrawals: number;
}

interface WalletConfig {
  currency: string;
  currencySymbol: string;
  defaultMinWithdrawal: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

interface AdminPanelProps {
  walletConfig?: WalletConfig;
}

const Dashboard: React.FC<AdminPanelProps> = ({}) => {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalWithdrawn: 0,
    totalEarnings: 0,
    pendingWithdrawals: 0
  });
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceAction, setBalanceAction] = useState<'add' | 'deduct'>('add');
  const [balanceDescription, setBalanceDescription] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);

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

        const usernameMatch = user.username?.toLowerCase().includes(searchLower) || false;
        const firstNameMatch = user.firstName?.toLowerCase().includes(searchLower) || false;
        const lastNameMatch = user.lastName?.toLowerCase().includes(searchLower) || false;

        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase().trim();
        const fullNameMatch = fullName.includes(searchLower);

        const telegramIdMatch = user.telegramId.toString().includes(searchTerm);

        return usernameMatch || firstNameMatch || lastNameMatch || fullNameMatch || telegramIdMatch;
      });
      setFilteredUsers(filtered);
    }
    setCurrentPage(1);
  }, [searchTerm, users]);

  // Pagination calculations - FIXED: Ensure we always have valid page numbers
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  // Fix: Reset to page 1 when users per page changes or filtered users change significantly
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleUsersPerPageChange = (value: number) => {
    setUsersPerPage(value);
    setCurrentPage(1); // Always reset to first page when changing items per page
  };

  const getPageNumbers = () => {
    const pageNumbers: (number | string)[] = [];
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

  const setupRealtimeListeners = () => {
    // Users listener
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const usersData: UserData[] = [];
        snapshot.forEach((childSnapshot) => {
          const userData = childSnapshot.val();
          usersData.push(userData);
        });
        setUsers(usersData);
        calculateStats(usersData);
      }
    });

    // Transactions listener for pending withdrawals
    const transactionsRef = ref(database, 'transactions');
    onValue(transactionsRef, (snapshot) => {
      if (snapshot.exists()) {
        let pendingWithdrawals = 0;
        
        snapshot.forEach((childSnapshot) => {
          const transaction = childSnapshot.val();
          
          // Count pending withdrawals
          if (transaction.type === 'withdrawal' && transaction.status === 'pending') {
            pendingWithdrawals += transaction.amount;
          }
        });
        
        setStats(prev => ({ 
          ...prev, 
          pendingWithdrawals
        }));
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

    setStats({
      totalUsers: usersData.length,
      totalWithdrawn,
      totalEarnings,
      pendingWithdrawals: stats.pendingWithdrawals // Keep existing value
    });
  };

  const loadAdminData = async () => {
    try {
      const usersRef = ref(database, 'users');
      const usersSnapshot = await get(usersRef);

      if (usersSnapshot.exists()) {
        const usersData: UserData[] = [];
        usersSnapshot.forEach((childSnapshot) => {
          usersData.push(childSnapshot.val());
        });
        setUsers(usersData);
        calculateStats(usersData);
      }

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

  const handleEditUser = async (user: UserData) => {
    setSelectedUser(user);
    setBalanceAmount('');
    setBalanceDescription('');
    setBalanceAction('add');
  };

  const handleCloseUserDetails = () => {
    setSelectedUser(null);
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

      await update(ref(database, `users/${selectedUser.telegramId}`), {
        balance: newBalance,
        totalEarned: newTotalEarned
      });

      const transaction = {
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

      const userRef = ref(database, `users/${selectedUser.telegramId}`);
      const userSnapshot = await get(userRef);
      if (userSnapshot.exists()) {
        setSelectedUser(userSnapshot.val());
      }

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

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Premium Pagination Component - FIXED
  const Pagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-1">
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

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="hidden sm:flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center justify-center w-10 h-10 bg-gray-800 border border-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

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

      <div className="hidden sm:block text-sm text-gray-400 whitespace-nowrap">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );

  // Mobile User Card Component - REMOVED ads fields
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
          <p className="text-gray-400 text-xs">Joined</p>
          <p className="text-gray-300 text-xs">{formatDate(user.joinDate)}</p>
        </div>
      </div>
    </div>
  );

  const renderUsersList = () => (
    <div className="bg-gray-800 rounded-xl p-4 mt-6 border border-gray-700">
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

      <div className="text-sm text-gray-400 mb-4 px-1">
        Showing {Math.min(currentUsers.length, usersPerPage)} of {filteredUsers.length} users
      </div>

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

      <Pagination />
    </div>
  );

  const renderUsersTable = () => (
    <div className="bg-gray-800 rounded-xl p-6 mt-6 border border-gray-700">
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

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-400">
          Showing {indexOfFirstUser + 1}-{Math.min(indexOfLastUser, filteredUsers.length)} of {filteredUsers.length} users
        </div>
      </div>

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

      <Pagination />
    </div>
  );

  if (selectedUser) {
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

          {/* User Info + Balance Management */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* User Info Card */}
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
                  <p className="text-gray-400">Joined</p>
                  <p className="text-gray-300">
                    {formatDate(selectedUser.joinDate)}
                  </p>
                </div>
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-2">Manage your users and monitor platform statistics</p>
        </div>

        {/* REMOVED Total Ads Watched stat card */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
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

          <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Total Withdrawn</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white">${stats.totalWithdrawn.toFixed(2)}</p>
              </div>
              <div className="p-2 sm:p-3 bg-green-500/20 rounded-lg">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-green-400" />
              </div>
            </div>
          </div>

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
