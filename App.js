import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  Clock, 
  Calendar as CalendarIcon, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Coffee, 
  TrendingUp, 
  User, 
  LogOut, 
  Plus, 
  Edit2, 
  Trash2, 
  Filter, 
  Search, 
  Shield, 
  Sun, 
  Moon, 
  Award, 
  MapPin, 
  MessageSquare,
  BarChart3,
  List,
  UserCheck,
  Zap,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Key,
  Mail,
  Lock,
  ArrowRight,
  ShieldAlert,
  Sliders,
  Check
} from 'lucide-react';

// --- CONSTANTS ---
const ADMIN_EMAIL = "Fikredbelay2002@gmail.com";

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "demo-api-key",
      authDomain: "demo-app.firebaseapp.com",
      projectId: "demo-app",
      storageBucket: "demo-app.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:demo"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'attendance-tracker-app';

// Mock initial dataset for realistic demonstration
const generateInitialMockData = (currentUserId, currentUserEmail) => {
  const today = new Date();
  const mockLogs = [];
  const statuses = ['Present', 'Present', 'Present', 'Late', 'Present', 'On Leave', 'Absent'];
  
  const sampleUsers = [
    { uid: currentUserId || 'user-1', email: currentUserEmail || 'employee@company.com', name: 'Standard User' },
    { uid: 'admin-123', email: ADMIN_EMAIL, name: 'Fikre D. (Admin)' },
    { uid: 'emp-002', email: 'sarah.connor@company.com', name: 'Sarah Connor' },
    { uid: 'emp-003', email: 'michael.scott@company.com', name: 'Michael Scott' }
  ];

  for (let i = 25; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    // Skip weekends
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dateStr = date.toISOString().split('T')[0];
    
    sampleUsers.forEach((u, uIdx) => {
      const statusIndex = Math.floor((Math.random() + uIdx) % statuses.length);
      const status = statuses[statusIndex];

      let clockIn = "09:00";
      let clockOut = "17:00";
      let hours = 8.0;

      if (status === 'Late') {
        clockIn = "09:42";
        hours = 7.3;
      } else if (status === 'Absent' || status === 'On Leave') {
        clockIn = "--:--";
        clockOut = "--:--";
        hours = 0.0;
      }

      mockLogs.push({
        id: `log-${u.uid}-${dateStr}`,
        userId: u.uid,
        userEmail: u.email,
        userName: u.name,
        date: dateStr,
        clockIn,
        clockOut,
        status,
        hours,
        location: status !== 'Absent' && status !== 'On Leave' ? 'HQ Main Building' : 'N/A',
        notes: status === 'Late' ? 'Traffic bottleneck' : (status === 'On Leave' ? 'Approved Annual Leave' : 'Standard Routine Work')
      });
    });
  }

  return mockLogs;
};

export default function App() {
  // --- STATE MANAGEMENT ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  // Authentication State
  const [currentUserEmail, setCurrentUserEmail] = useState(ADMIN_EMAIL);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState('login'); // 'login' or 'signup'
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Main UI Navigation Tabs
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'calendar', 'history', 'admin'

  // Attendance Data & Firestore Sync
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  
  // Realtime Clock-In State
  const [clockedIn, setClockedIn] = useState(false);
  const [locationNote, setLocationNote] = useState('HQ Main Building');
  const [sessionNotes, setSessionNotes] = useState('');

  // History & Admin Filter / Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [userFilter, setUserFilter] = useState('All');

  // Manual Record Modal State
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState({
    userId: '',
    userEmail: '',
    date: new Date().toISOString().split('T')[0],
    clockIn: '09:00',
    clockOut: '17:00',
    status: 'Present',
    location: 'HQ Main Building',
    notes: ''
  });

  // Calendar View
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  // Derive Admin Role
  const isAdmin = useMemo(() => {
    return currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }, [currentUserEmail]);

  // --- FIREBASE AUTH EFFECT ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  // --- FIRESTORE REALTIME SYNC EFFECT ---
  useEffect(() => {
    if (!user) return;

    // Strict path for public collection in artifact space to allow multi-user visibility for admin
    const recordsCol = collection(db, 'artifacts', appId, 'public', 'data', 'attendance_logs');

    const unsubscribe = onSnapshot(recordsCol, 
      (snapshot) => {
        const fetchedRecords = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (fetchedRecords.length === 0) {
          // Seed database with mock items if completely empty
          const initialData = generateInitialMockData(user.uid, currentUserEmail);
          initialData.forEach(async (item) => {
            const docRef = doc(recordsCol, item.id);
            await setDoc(docRef, item);
          });
          setAttendanceRecords(initialData);
        } else {
          fetchedRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
          setAttendanceRecords(fetchedRecords);
        }
      },
      (error) => {
        console.error("Error fetching attendance logs from Firestore:", error);
      }
    );

    return () => unsubscribe();
  }, [user, currentUserEmail]);

  // Check if today is clocked in for current user
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayRecord = attendanceRecords.find(r => r.date === todayStr && r.userEmail === currentUserEmail);
    if (todayRecord && todayRecord.clockIn !== '--:--' && todayRecord.clockOut === '--:--') {
      setClockedIn(true);
    } else {
      setClockedIn(false);
    }
  }, [attendanceRecords, currentUserEmail]);

  // --- QUICK DEMO ROLE SWITCHER ---
  const handleQuickRoleSwitch = (email) => {
    setCurrentUserEmail(email);
    setIsAuthModalOpen(false);
  };

  // Login/Signup Form Submission Handler
  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (!emailInput) return;
    setCurrentUserEmail(emailInput);
    setIsAuthModalOpen(false);
    setEmailInput('');
    setPasswordInput('');
  };

  // Sign Out Handler
  const handleSignOut = async () => {
    setCurrentUserEmail('guest@company.com');
  };

  // --- CLOCK IN / CLOCK OUT HANDLERS ---
  const handleClockIn = async () => {
    if (!user) return;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isLate = currentHour > 9 || (currentHour === 9 && currentMinute > 15);
    const status = isLate ? 'Late' : 'Present';

    const newRecord = {
      userId: user.uid,
      userEmail: currentUserEmail,
      userName: currentUserEmail === ADMIN_EMAIL ? 'Fikre D. (Admin)' : currentUserEmail.split('@')[0],
      date: dateStr,
      clockIn: timeStr,
      clockOut: '--:--',
      status,
      hours: 0,
      location: locationNote || 'HQ Main Building',
      notes: sessionNotes || (isLate ? 'Late arrival recorded' : 'On-time daily punch')
    };

    try {
      const recordsCol = collection(db, 'artifacts', appId, 'public', 'data', 'attendance_logs');
      const docRef = doc(recordsCol, `log-${user.uid}-${dateStr}`);
      await setDoc(docRef, newRecord);
      setClockedIn(true);
      setSessionNotes('');
    } catch (err) {
      console.error("Error recording Clock-In:", err);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const todayRecord = attendanceRecords.find(r => r.date === dateStr && r.userEmail === currentUserEmail);
    
    let calculatedHours = 8.0;
    if (todayRecord && todayRecord.clockIn !== '--:--') {
      const [startH, startM] = todayRecord.clockIn.split(':').map(Number);
      const [endH, endM] = timeStr.split(':').map(Number);
      const diffMs = new Date(now.setHours(endH, endM)) - new Date(now.setHours(startH, startM));
      calculatedHours = Math.max(0, parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2)));
    }

    try {
      const recordsCol = collection(db, 'artifacts', appId, 'public', 'data', 'attendance_logs');
      const docRef = doc(recordsCol, `log-${user.uid}-${dateStr}`);
      await updateDoc(docRef, {
        clockOut: timeStr,
        hours: calculatedHours,
        notes: sessionNotes ? `${todayRecord?.notes || ''} | Out: ${sessionNotes}` : todayRecord?.notes
      });
      setClockedIn(false);
      setSessionNotes('');
    } catch (err) {
      console.error("Error recording Clock-Out:", err);
    }
  };

  // --- MANUAL ENTRY & EDIT MODAL HANDLERS ---
  const handleOpenRecordModal = (record = null) => {
    if (record) {
      setEditingRecord(record);
      setFormData({
        userId: record.userId || user?.uid,
        userEmail: record.userEmail || currentUserEmail,
        date: record.date,
        clockIn: record.clockIn,
        clockOut: record.clockOut,
        status: record.status,
        location: record.location || 'HQ Main Building',
        notes: record.notes || ''
      });
    } else {
      setEditingRecord(null);
      setFormData({
        userId: user?.uid || 'user-1',
        userEmail: currentUserEmail,
        date: new Date().toISOString().split('T')[0],
        clockIn: '09:00',
        clockOut: '17:00',
        status: 'Present',
        location: 'HQ Main Building',
        notes: 'Admin Manual Entry'
      });
    }
    setIsRecordModalOpen(true);
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    if (!user) return;

    let calculatedHours = 0;
    if (formData.clockIn !== '--:--' && formData.clockOut !== '--:--') {
      const [startH, startM] = formData.clockIn.split(':').map(Number);
      const [endH, endM] = formData.clockOut.split(':').map(Number);
      const start = new Date(); start.setHours(startH, startM, 0);
      const end = new Date(); end.setHours(endH, endM, 0);
      calculatedHours = Math.max(0, parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2)));
    }

    const targetUserEmail = formData.userEmail || currentUserEmail;
    const payload = {
      userId: formData.userId || user.uid,
      userEmail: targetUserEmail,
      userName: targetUserEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'Fikre D. (Admin)' : targetUserEmail.split('@')[0],
      date: formData.date,
      clockIn: formData.clockIn,
      clockOut: formData.clockOut,
      status: formData.status,
      hours: calculatedHours,
      location: formData.location,
      notes: formData.notes
    };

    try {
      const recordsCol = collection(db, 'artifacts', appId, 'public', 'data', 'attendance_logs');
      if (editingRecord) {
        const docRef = doc(recordsCol, editingRecord.id);
        await updateDoc(docRef, payload);
      } else {
        const docRef = doc(recordsCol, `log-${payload.userId}-${formData.date}`);
        await setDoc(docRef, payload);
      }
      setIsRecordModalOpen(false);
    } catch (err) {
      console.error("Error saving manual attendance record:", err);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!user || !isAdmin) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'attendance_logs', recordId);
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Error deleting log:", err);
    }
  };

  // --- EXPORT TO CSV ---
  const exportToCSV = () => {
    const headers = ["Date", "User Email", "Status", "Clock In", "Clock Out", "Hours", "Location", "Notes"];
    const rows = filteredRecords.map(r => [
      r.date,
      r.userEmail,
      r.status,
      r.clockIn,
      r.clockOut,
      r.hours,
      `"${r.location || ''}"`,
      `"${r.notes || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- COMPUTED STATS ---
  const stats = useMemo(() => {
    // Filter relevant records (if regular user, show personal stats; if admin, global or scoped)
    const targetLogs = isAdmin 
      ? (userFilter === 'All' ? attendanceRecords : attendanceRecords.filter(r => r.userEmail === userFilter))
      : attendanceRecords.filter(r => r.userEmail === currentUserEmail);

    const totalDays = targetLogs.length;
    const totalPresent = targetLogs.filter(r => r.status === 'Present').length;
    const totalLate = targetLogs.filter(r => r.status === 'Late').length;
    const totalAbsent = targetLogs.filter(r => r.status === 'Absent').length;
    const totalLeave = targetLogs.filter(r => r.status === 'On Leave').length;
    const totalHours = targetLogs.reduce((acc, curr) => acc + (curr.hours || 0), 0);
    const onTimeRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 100;

    let streak = 0;
    const sorted = [...targetLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (let rec of sorted) {
      if (rec.status === 'Present' || rec.status === 'Late') {
        streak++;
      } else if (rec.status === 'Absent') {
        break;
      }
    }

    return {
      totalDays,
      totalPresent,
      totalLate,
      totalAbsent,
      totalLeave,
      totalHours: totalHours.toFixed(1),
      onTimeRate,
      streak
    };
  }, [attendanceRecords, isAdmin, currentUserEmail, userFilter]);

  // --- FILTERED LOGS ---
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter(rec => {
      // Visibility rule: Users see only their own, Admin sees all or filtered by user
      const matchesUserScope = isAdmin 
        ? (userFilter === 'All' || rec.userEmail === userFilter)
        : rec.userEmail === currentUserEmail;

      const matchesSearch = rec.date.includes(searchTerm) || 
                            rec.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            rec.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            rec.location?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'All' || rec.status === statusFilter;

      return matchesUserScope && matchesSearch && matchesStatus;
    });
  }, [attendanceRecords, isAdmin, currentUserEmail, userFilter, searchTerm, statusFilter]);

  // Unique list of users in records for admin dropdown
  const uniqueUsersList = useMemo(() => {
    const emails = Array.from(new Set(attendanceRecords.map(r => r.userEmail)));
    return emails.filter(Boolean);
  }, [attendanceRecords]);

  // --- CALENDAR GRID HELPER ---
  const renderCalendarDays = () => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const days = [];

    // Empty lead cells
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-slate-900/20 rounded-xl border border-slate-800/40 opacity-30" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Find record for active view context
      const record = attendanceRecords.find(r => 
        r.date === formattedDate && 
        (isAdmin ? (userFilter === 'All' ? r.userEmail === currentUserEmail : r.userEmail === userFilter) : r.userEmail === currentUserEmail)
      );

      let statusBg = 'bg-slate-900/60 border-slate-800 text-slate-400';
      let badgeBg = 'bg-slate-800 text-slate-300';

      if (record) {
        switch (record.status) {
          case 'Present':
            statusBg = 'bg-emerald-950/20 border-emerald-800/50 text-emerald-300';
            badgeBg = 'bg-emerald-500 text-white';
            break;
          case 'Late':
            statusBg = 'bg-amber-950/20 border-amber-800/50 text-amber-300';
            badgeBg = 'bg-amber-500 text-white';
            break;
          case 'Absent':
            statusBg = 'bg-rose-950/20 border-rose-800/50 text-rose-300';
            badgeBg = 'bg-rose-500 text-white';
            break;
          case 'On Leave':
            statusBg = 'bg-indigo-950/20 border-indigo-800/50 text-indigo-300';
            badgeBg = 'bg-indigo-500 text-white';
            break;
        }
      }

      const isToday = formattedDate === new Date().toISOString().split('T')[0];

      days.push(
        <div 
          key={day}
          onClick={() => isAdmin && handleOpenRecordModal(record || { date: formattedDate, clockIn: '09:00', clockOut: '17:00', status: 'Present', location: 'HQ Main Building', notes: '' })}
          className={`h-24 p-2.5 border rounded-2xl transition-all duration-200 hover:border-violet-500/60 cursor-pointer flex flex-col justify-between ${statusBg} ${isToday ? 'ring-2 ring-violet-500' : ''}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${isToday ? 'bg-violet-600 text-white' : 'text-slate-300'}`}>
              {day}
            </span>
            {record && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeBg}`}>
                {record.status}
              </span>
            )}
          </div>
          {record ? (
            <div className="text-[11px] space-y-0.5 font-medium">
              <div className="flex items-center gap-1 text-slate-300">
                <Clock className="w-3 h-3 text-violet-400" />
                <span>{record.clockIn} - {record.clockOut}</span>
              </div>
              <div className="text-[10px] text-slate-400">{record.hours} hrs</div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-600 italic">No record</span>
          )}
        </div>
      );
    }

    return days;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium">Loading Attendance Tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* HEADER / NAVIGATION BAR */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-900/90 border-b border-slate-800/80 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight bg-gradient-to-r from-violet-400 to-indigo-300 bg-clip-text text-transparent">
                AttendX Pro
              </h1>
              <p className="text-xs text-slate-400">Enterprise Tracker</p>
            </div>
          </div>

          {/* Quick Role Switcher & Account Profile */}
          <div className="flex items-center gap-3 lg:gap-5">
            
            {/* Quick Demo Switcher Button */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <span className="text-xs font-semibold px-2 text-slate-400">Demo Role:</span>
              <button
                onClick={() => handleQuickRoleSwitch(ADMIN_EMAIL)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isAdmin 
                    ? 'bg-violet-600 text-white shadow-md' 
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Admin
              </button>
              <button
                onClick={() => handleQuickRoleSwitch('employee@company.com')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  !isAdmin 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Employee
              </button>
            </div>

            {/* Profile Info */}
            <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
              <div className="w-9 h-9 rounded-full bg-violet-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
                {currentUserEmail.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{currentUserEmail}</p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${
                  isAdmin ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}>
                  <Shield className="w-3 h-3" />
                  {isAdmin ? 'System Admin' : 'Employee'}
                </span>
              </div>
            </div>

            {/* Auth Modal Trigger */}
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
              title="Account Settings & Authentication"
            >
              <Key className="w-4 h-4" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors border border-slate-700"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        
        {/* TABS NAVIGATION & EXPORT BAR */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <nav className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'calendar'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              Calendar
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'history'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-4 h-4" />
              Attendance Logs
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'admin'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                    : 'text-amber-400 hover:text-amber-200'
                }`}
              >
                <Sliders className="w-4 h-4" />
                Admin Panel
              </button>
            )}
          </nav>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={exportToCSV}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition-all text-sm"
            >
              <Download className="w-4 h-4 text-violet-400" />
              Export CSV
            </button>
            
            {isAdmin && (
              <button
                onClick={() => handleOpenRecordModal()}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-violet-500/20 hover:opacity-95 transition-all text-sm"
              >
                <Plus className="w-4 h-4" />
                Manual Entry
              </button>
            )}
          </div>
        </div>

        {/* SUMMARY STAT CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Days Present</p>
              <h3 className="text-2xl font-bold text-slate-100 mt-1">{stats.totalPresent} <span className="text-xs font-normal text-slate-500">/ {stats.totalDays}</span></h3>
              <p className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {stats.totalLate} Late check-ins
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">On-Time Rate</p>
              <h3 className="text-2xl font-bold text-slate-100 mt-1">{stats.onTimeRate}%</h3>
              <p className="text-xs text-violet-400 font-medium mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> High Consistency
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-950/50 border border-violet-800/50 text-violet-400 flex items-center justify-center">
              <Award className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Work Hours</p>
              <h3 className="text-2xl font-bold text-slate-100 mt-1">{stats.totalHours} hrs</h3>
              <p className="text-xs text-indigo-400 font-medium mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Logged & Validated
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/50 border border-indigo-800/50 text-indigo-400 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Streak</p>
              <h3 className="text-2xl font-bold text-slate-100 mt-1">{stats.streak} Days</h3>
              <p className="text-xs text-amber-400 font-medium mt-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Consecutive Attendance
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-950/50 border border-amber-800/50 text-amber-400 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* TAB 1: DASHBOARD (CLOCK IN/OUT WIDGET & RECENT ACTIVITY) */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* PUNCH CLOCK WIDGET */}
            <div className="lg:col-span-1 bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-400 bg-violet-950/60 border border-violet-800/50 px-3 py-1 rounded-full">
                    Daily Punch Clock
                  </span>
                  <span className="flex h-3 w-3 relative">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${clockedIn ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${clockedIn ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  </span>
                </div>

                <div className="text-center my-6 py-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                  <div className="text-4xl font-extrabold text-white font-mono tracking-tight">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <p className="text-xs font-medium text-slate-400 mt-1">
                    {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Current Work Location
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input 
                        type="text" 
                        value={locationNote}
                        onChange={(e) => setLocationNote(e.target.value)}
                        placeholder="e.g. HQ Building / Remote Office"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Session Work Note
                    </label>
                    <div className="relative">
                      <MessageSquare className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input 
                        type="text" 
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        placeholder="e.g. Starting daily sprint"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                {!clockedIn ? (
                  <button
                    onClick={handleClockIn}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                  >
                    <Clock className="w-5 h-5" />
                    CLOCK IN NOW
                  </button>
                ) : (
                  <button
                    onClick={handleClockOut}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 active:scale-98"
                  >
                    <LogOut className="w-5 h-5" />
                    CLOCK OUT NOW
                  </button>
                )}
              </div>
            </div>

            {/* RECENT ATTENDANCE ACTIVITY */}
            <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-violet-400" />
                    Recent Activity Logs
                  </h3>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className="text-xs font-semibold text-violet-400 hover:underline"
                  >
                    View All Logs &rarr;
                  </button>
                </div>

                <div className="space-y-3">
                  {attendanceRecords.slice(0, 5).map((rec) => (
                    <div 
                      key={rec.id}
                      className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          rec.status === 'Present' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' :
                          rec.status === 'Late' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/50' :
                          rec.status === 'Absent' ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50' :
                          'bg-indigo-950/60 text-indigo-400 border border-indigo-800/50'
                        }`}>
                          {rec.status === 'Present' && <CheckCircle className="w-5 h-5" />}
                          {rec.status === 'Late' && <AlertCircle className="w-5 h-5" />}
                          {rec.status === 'Absent' && <XCircle className="w-5 h-5" />}
                          {rec.status === 'On Leave' && <Coffee className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-200">{rec.date} <span className="text-xs font-normal text-slate-500">({rec.userEmail})</span></p>
                          <p className="text-xs text-slate-400">{rec.location || 'HQ Main Building'} • {rec.notes || 'No extra notes'}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-semibold text-slate-300 block">
                          {rec.clockIn} - {rec.clockOut}
                        </span>
                        <span className="text-[11px] text-slate-500">{rec.hours} hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ADMIN BANNER */}
              {isAdmin && (
                <div className="mt-6 p-4 rounded-2xl bg-amber-950/30 border border-amber-800/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-xs font-bold text-amber-200">Admin Privileges Active</p>
                      <p className="text-[11px] text-amber-400/80">Logged in as {ADMIN_EMAIL}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('admin')}
                    className="text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Manage
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: INTERACTIVE CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-6">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-100">
                  {currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button 
                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1))}
                    className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setCurrentMonthDate(new Date())}
                    className="px-2 py-0.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1))}
                    className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ADMIN CALENDAR SCOPE SELECTOR */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="All">All User Records</option>
                    {uniqueUsersList.map(email => (
                      <option key={email} value={email}>{email}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {renderCalendarDays()}
            </div>
          </div>
        )}

        {/* TAB 3: ATTENDANCE LOGS TABLE */}
        {activeTab === 'history' && (
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-6">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search date, email, notes..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Absent">Absent</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>

                {isAdmin && (
                  <select 
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium"
                  >
                    <option value="All">All Employees</option>
                    {uniqueUsersList.map(email => (
                      <option key={email} value={email}>{email}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                    <th className="py-3 px-4 rounded-l-xl">Date</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Clock In</th>
                    <th className="py-3 px-4">Clock Out</th>
                    <th className="py-3 px-4">Hours</th>
                    <th className="py-3 px-4">Location & Notes</th>
                    {isAdmin && <th className="py-3 px-4 text-right rounded-r-xl">Admin Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {rec.date}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-300">
                          {rec.userEmail}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            rec.status === 'Present' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' :
                            rec.status === 'Late' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/50' :
                            rec.status === 'Absent' ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50' :
                            'bg-indigo-950/60 text-indigo-400 border border-indigo-800/50'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                          {rec.clockIn}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                          {rec.clockOut}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-300">
                          {rec.hours} hrs
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-400 max-w-xs truncate">
                          <span className="font-medium text-slate-300">{rec.location}</span>
                          {rec.notes && <span className="block text-[11px] text-slate-500">{rec.notes}</span>}
                        </td>
                        {isAdmin && (
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenRecordModal(rec)}
                                className="p-1.5 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors"
                                title="Edit Record"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRecord(rec.id)}
                                className="p-1.5 hover:bg-rose-950/60 text-rose-400 rounded-lg transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-slate-500 text-sm">
                        No matching attendance logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* TAB 4: ADMIN CONTROL PANEL (ONLY FOR ADMIN) */}
        {activeTab === 'admin' && isAdmin && (
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Administrator Command Center</h2>
                  <p className="text-xs text-slate-400">Managing global system logs for {ADMIN_EMAIL}</p>
                </div>
              </div>
              <button
                onClick={() => handleOpenRecordModal()}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-600/20"
              >
                <Plus className="w-4 h-4" /> Create Manual Record
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Total System Users</h4>
                <p className="text-2xl font-extrabold text-slate-100">{uniqueUsersList.length} Accounts</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Total Logs Captured</h4>
                <p className="text-2xl font-extrabold text-slate-100">{attendanceRecords.length} Records</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Admin Email Target</h4>
                <p className="text-xs font-mono font-bold text-amber-400 truncate">{ADMIN_EMAIL}</p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* AUTHENTICATION / DEMO SWITCHER MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-6">
            
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Key className="w-5 h-5 text-violet-400" />
                Account & Demo Switcher
              </h3>
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* QUICK DEMO SWITCH BUTTONS */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Instant Role Switcher</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleQuickRoleSwitch(ADMIN_EMAIL)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isAdmin 
                      ? 'bg-amber-950/40 border-amber-500 text-amber-200' 
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold">Admin Role</p>
                  <p className="text-[10px] text-slate-400 truncate">{ADMIN_EMAIL}</p>
                </button>

                <button
                  onClick={() => handleQuickRoleSwitch('employee@company.com')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !isAdmin 
                      ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200' 
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold">Employee Role</p>
                  <p className="text-[10px] text-slate-400 truncate">employee@company.com</p>
                </button>
              </div>
            </div>

            {/* MANUAL LOGIN FORM */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input 
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="e.g. Fikredbelay2002@gmail.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input 
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-all text-sm"
              >
                Sign In / Switch Account
              </button>
            </form>

          </div>
        </div>
      )}

      {/* MANUAL OVERRIDE / ENTRY MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-6">
            
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100">
                {editingRecord ? 'Edit Attendance Entry' : 'Manual Attendance Entry'}
              </h3>
              <button 
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Target User Email
                </label>
                <input 
                  type="email"
                  required
                  value={formData.userEmail}
                  onChange={(e) => setFormData({ ...formData, userEmail: e.target.value })}
                  placeholder="e.g. employee@company.com"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Date
                </label>
                <input 
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Clock In Time
                  </label>
                  <input 
                    type="time"
                    value={formData.clockIn}
                    onChange={(e) => setFormData({ ...formData, clockIn: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Clock Out Time
                  </label>
                  <input 
                    type="time"
                    value={formData.clockOut}
                    onChange={(e) => setFormData({ ...formData, clockOut: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Attendance Status
                </label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                  <option value="On Leave">On Leave</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Location
                </label>
                <input 
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. HQ Main Building"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Reason / Notes
                </label>
                <textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Reason for manual adjustment..."
                  rows="2"
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-md shadow-violet-500/20 transition-all"
                >
                  Save Record
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
