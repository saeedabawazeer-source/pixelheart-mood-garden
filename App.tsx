import React, { useState, useEffect, useRef } from 'react';
import { Memory } from './types';
import { saveMemory, getMemories, syncLocalToCloud } from './services/db';
import LoadingScreen from './components/LoadingScreen';
import PasswordScreen, { UserRole } from './components/PasswordScreen';

// --- Types ---
type Wish = {
  id: number;
  text: string;
  rotation: number;
  position: { top?: string; left?: string; right?: string; bottom?: string };
  color: string;
};

const STICKY_POSITIONS = [
  { top: '-5%', left: '-5%' },
  { top: '10%', right: '-8%' },
  { bottom: '28%', left: '-8%' },
  { bottom: '-5%', right: '-5%' },
  { top: '50%', right: '-10%' },
  { top: '20%', left: '-12%' },
];

const STICKY_COLORS = ['#FEF3C7', '#FCE7F3', '#D1FAE5', '#E0F2FE', '#FFD1DC'];

// --- Helper: Calculate Streak ---
const calculateStreak = (memories: Memory[]) => {
  if (memories.length === 0) return 0;

  // Sort by date descending
  // Our dates are "MMM D", so we need to be careful. 
  // Ideally we would store timestamps, but for now let's rely on the DB sort or parse the string.
  // Since we don't have year in the display string, this is tricky.
  // BUT: db.ts sorts by ID (timestamp) descending. So memories[0] is latest.

  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let lastDate = today;
  // We'll walk back. The logic here is approximate for "MMM D" without year, 
  // but assuming data is recent (current year).

  // Actually, let's just count consecutive days derived from ID timestamp as it's more reliable
  const oneDay = 24 * 60 * 60 * 1000;

  // Check if latest memory is today
  const latestTs = Number(memories[0].id);
  const latestDate = new Date(latestTs);
  latestDate.setHours(0, 0, 0, 0);

  if (latestDate.getTime() === today.getTime()) {
    currentStreak = 1;
  } else if (latestDate.getTime() === today.getTime() - oneDay) {
    currentStreak = 1; // Streak is alive from yesterday
  } else {
    return 0; // Streak broken
  }

  // Check previous elements
  for (let i = 1; i < memories.length; i++) {
    const prevTs = Number(memories[i - 1].id);
    const currTs = Number(memories[i].id);

    const prevD = new Date(prevTs);
    prevD.setHours(0, 0, 0, 0);

    const currD = new Date(currTs);
    currD.setHours(0, 0, 0, 0);

    const diff = prevD.getTime() - currD.getTime();

    if (diff === oneDay) {
      currentStreak++;
    } else if (diff === 0) {
      continue; // Same day multiple posts, ignore
    } else {
      break; // Gap found
    }
  }

  return currentStreak;
};


const App: React.FC = () => {
  // --- App Flow State ---
  const [appState, setAppState] = useState<'LOADING' | 'AUTH' | 'SPECIAL_LOADING' | 'APP'>('LOADING');
  const [currentUser, setCurrentUser] = useState<UserRole | null>(null);

  // State
  const [inputMood, setInputMood] = useState('');
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Note Modal State
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  // Camera State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // History / Calendar State
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Memory | null>(null);
  const [selectedDayMemories, setSelectedDayMemories] = useState<Memory[]>([]);
  const [streak, setStreak] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // --- Init ---
  useEffect(() => {
    // We only load data when entering APP state, but we can pre-load or check migration here.
    // Let's handled it in a separate effect that runs once but updates only when appState becomes APP?
    // Or just run it now.
  }, []);

  // Effect to handle migration and loading when entering APP
  useEffect(() => {
    if (appState === 'APP') {
      const loadData = async () => {
        // 1. Migrate LocalStorage if exists
        const oldData = localStorage.getItem('pixelHerMemories');
        if (oldData) {
          try {
            const parsed: Memory[] = JSON.parse(oldData);
            if (Array.isArray(parsed)) {
              console.log("Migrating", parsed.length, "memories to IndexedDB");
              for (const m of parsed) {
                await saveMemory(m);
              }
            }
            localStorage.removeItem('pixelHerMemories');
          } catch (e) {
            console.error("Migration failed", e);
          }
        }

        // 2. Load from DB
        const dbMemories = await getMemories();
        setMemories(dbMemories);
        setStreak(calculateStreak(dbMemories));

        // 3. For Saeed: Auto-sync local photos to cloud in background
        if (currentUser === 'saeed') {
          syncLocalToCloud().then(result => {
            console.log(`☁️ Auto-synced ${result.synced} photos to cloud`);
          }).catch(err => console.warn('Auto-sync failed:', err));

          // Start Camera only for Saeed
          startCamera();
        }
      };
      loadData();
    }

    return () => {
      if (appState === 'APP' && currentUser === 'saeed') stopCamera();
    };
  }, [appState, currentUser]);


  // --- Camera Functions ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", aspectRatio: 1 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error("Camera access denied", err);
      // Retry logic or just stay inactive
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        // Square crop
        const size = Math.min(video.videoWidth, video.videoHeight);
        canvas.width = size;
        canvas.height = size;

        // Calculate center crop
        const xOffset = (video.videoWidth - size) / 2;
        const yOffset = (video.videoHeight - size) / 2;

        // Draw flipped (mirror effect)
        context.translate(size, 0);
        context.scale(-1, 1);

        context.drawImage(video, xOffset, yOffset, size, size, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/png');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setWishes([]);
    startCamera();
  };

  // --- Logic ---
  const createWish = (text: string, index: number): Wish => {
    const posIndex = index % STICKY_POSITIONS.length;
    return {
      id: Date.now() + Math.random(),
      text,
      rotation: Math.random() * 10 - 5,
      position: STICKY_POSITIONS[posIndex],
      color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
    };
  };

  const openNoteModal = () => {
    setShowNoteModal(true);
  };

  const closeNoteModal = () => {
    setShowNoteModal(false);
    setNoteInput('');
  };

  const handleStickNote = async () => {
    if (!noteInput.trim()) return;

    // Create the wish immediately with the user's text
    const newWish = createWish(noteInput, wishes.length);
    setWishes(prev => [...prev, newWish]);

    closeNoteModal();
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedImage) {
      takePhoto();
      return;
    }

    setIsGenerating(true);

    try {
      // Use user input or existing wishes as summary
      let currentSummary = inputMood.trim();
      if (!currentSummary && wishes.length > 0) {
        currentSummary = wishes.map(w => w.text).join(". ");
      }
      if (!currentSummary) currentSummary = "A quiet moment.";

      // Add as sticky note if typed something
      if (inputMood.trim()) {
        const newWish = createWish(inputMood, wishes.length);
        setWishes(prev => [...prev, newWish]);
      }

      // Save to DB
      const newMemory: Memory = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        mood: inputMood || (wishes.length > 0 ? "Noted" : "Vibing"),
        imageUrl: capturedImage,
        summary: currentSummary
      };

      await saveMemory(newMemory);

      const updatedMemories = [newMemory, ...memories];
      setMemories(updatedMemories);
      setStreak(calculateStreak(updatedMemories));

      // Reset after delay
      setTimeout(() => {
        retakePhoto();
        setInputMood('');
      }, 4000);

    } catch (err) {
      console.error("Posting failed", err);
    } finally {
      setIsGenerating(false);
    }
  };



  // --- Calendar Helpers ---
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const goToPrevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarMonth);
    const firstDay = getFirstDayOfMonth(calendarMonth);
    const days = [];

    // Empty cells for offset
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateToCheck = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), d);
      const dateStr = dateToCheck.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Find memories for this day
      const dayMemories = memories.filter(m => m.date === dateStr);
      const hasMemory = dayMemories.length > 0;
      const latestMemory = dayMemories[0];

      if (hasMemory) {
        // Render Mini Polaroid with count badge
        days.push(
          <button
            key={d}
            onClick={() => {
              setSelectedDayMemories(dayMemories);
              setSelectedDate(dayMemories[0]);
            }}
            className="group relative flex flex-col bg-white border-2 border-black p-0.5 pb-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:rotate-2 transition-all cursor-pointer overflow-hidden"
          >
            <div className="w-full aspect-square border border-black/20 bg-gray-100 overflow-hidden relative">
              <img src={latestMemory.imageUrl} className="w-full h-full object-cover" alt="day thumbnail" />
              {/* Photo count badge */}
              {dayMemories.length > 1 && (
                <div className="absolute top-0.5 right-0.5 bg-[#FF69B4] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-black">
                  {dayMemories.length}
                </div>
              )}
            </div>
            <span className="absolute bottom-0 left-0 right-0 text-center font-['Caveat'] font-bold text-xs text-black">{d}</span>
          </button>
        );
      } else {
        // Render Simple Day
        days.push(
          <div
            key={d}
            className="aspect-square flex items-center justify-center text-gray-400 font-['Outfit'] font-bold text-xs"
          >
            {d}
          </div>
        );
      }
    }
    return days;
  };

  // --- RENDER FLOW ---
  if (appState === 'LOADING') {
    return <LoadingScreen onComplete={() => setAppState('AUTH')} />;
  }

  if (appState === 'AUTH') {
    return <PasswordScreen onUnlock={(user) => {
      setCurrentUser(user);
      if (user === 'saeed') {
        // Trigger special suspense sequence for Saeed
        setAppState('SPECIAL_LOADING');
        setTimeout(() => setAppState('APP'), 4000); // 4 seconds suspense
      } else {
        setAppState('APP');
      }
    }} />;
  }

  // --- SPECIAL SUSPENSE SCREEN (Saeed only) ---
  if (appState === 'SPECIAL_LOADING') {
    return (
      <div className="h-[100dvh] w-full bg-[#FFE4E1] flex flex-col items-center justify-center p-8 animate-fade-in font-['Outfit'] relative overflow-hidden">
        {/* Background Pattern */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(#FF1493 2px, transparent 2px),
              linear-gradient(90deg, #FF1493 2px, transparent 2px)
            `,
            backgroundSize: '30px 30px'
          }}
        ></div>

        <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-sm w-full transform rotate-1 flex flex-col items-center text-center animate-bounce-in relative z-10">
          <div className="w-16 h-1 bg-gray-200 rounded-full mb-6 overflow-hidden border border-black">
            <div className="h-full bg-[#FF69B4] animate-[width_3s_ease-out_forwards]" style={{ width: '0%' }}></div>
          </div>

          <p className="font-['Caveat'] text-3xl font-bold text-black mb-2 leading-relaxed">
            ✨ Just a reminder... ✨
          </p>

          <p className="font-['Outfit'] font-black text-xl text-[#FF1493] uppercase tracking-widest mt-4 animate-pulse">
            YOU'RE BLACK
          </p>

          <div className="absolute -top-3 -right-3 text-4xl transform rotate-12">💖</div>
          <div className="absolute -bottom-3 -left-3 text-4xl transform -rotate-12">✨</div>
        </div>

        <style>{`
          @keyframes width { to { width: 100%; } }
        `}</style>
      </div>
    );
  }

  // --- GALLERY VIEW FOR SHAHAD (Viewer) ---
  if (currentUser === 'shahad') {
    return (
      <div className="h-[100dvh] w-full bg-[#FFE4E1] relative flex flex-col items-center overflow-hidden font-['Outfit'] selection:bg-[#FF69B4] selection:text-white">
        {/* --- Brutal Pattern Background --- */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(#FF1493 2px, transparent 2px),
              linear-gradient(90deg, #FF1493 2px, transparent 2px)
            `,
            backgroundSize: '30px 30px'
          }}
        ></div>

        {/* --- Header --- */}
        <div className="w-full px-4 pt-6 pb-4 flex items-center justify-center z-40">
          <div className="bg-white border-4 border-black px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
            <h1 className="font-['Caveat'] text-3xl md:text-4xl text-black font-bold tracking-wider">
              Shahad's View 💕
            </h1>
          </div>
        </div>

        {/* --- Gallery Grid --- */}
        <div className="flex-1 w-full overflow-y-auto px-4 pb-6 z-10">
          {memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-['Caveat'] text-2xl text-gray-500">No memories yet...</p>
                <p className="text-sm text-gray-400 mt-2">Saeed hasn't posted any photos yet!</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-center text-sm text-gray-500 mb-4 font-medium">
                {memories.length} {memories.length === 1 ? 'memory' : 'memories'} from Saeed ✨
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                {memories.map((memory) => (
                  <button
                    key={memory.id}
                    onClick={() => { setShowCalendar(true); setSelectedDate(memory); }}
                    className="group relative bg-white border-4 border-black p-2 pb-10 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:rotate-1 transition-all cursor-pointer"
                  >
                    {/* Photo */}
                    <div className="w-full aspect-square border-2 border-black/20 bg-gray-100 overflow-hidden">
                      <img src={memory.imageUrl} className="w-full h-full object-cover" alt="Memory" />
                    </div>
                    {/* Caption */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="font-['Caveat'] text-lg font-bold text-black truncate">{memory.mood}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{memory.date}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* --- Detail Modal (reusing calendar modal structure) --- */}
        {showCalendar && selectedDate && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 animate-fade-in">
            <div className="bg-[#FFF0F5] w-full max-w-[500px] max-h-[90dvh] border-4 border-black flex flex-col shadow-2xl animate-slide-up overflow-hidden">
              {/* Modal Header */}
              <div className="bg-white border-b-4 border-black p-3 flex justify-between items-center">
                <h2 className="font-['Caveat'] text-2xl font-bold">Memory Details</h2>
                <button onClick={() => { setShowCalendar(false); setSelectedDate(null); }} className="p-2 hover:bg-gray-100 rounded-full border-2 border-transparent hover:border-black transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Polaroid View */}
              <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-y-auto min-h-0 w-full">
                <div className="relative bg-white border-4 border-black p-3 pb-24 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col w-full max-w-[320px] transform rotate-1 shrink-0 transition-transform hover:scale-[1.02]">
                  {/* Photo Area */}
                  <div className="w-full aspect-square border-2 border-black bg-black relative flex items-center justify-center overflow-hidden">
                    <img src={selectedDate.imageUrl} className="w-full h-full object-cover" alt="Memory" />
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -translate-y-10 translate-x-10 pointer-events-none"></div>
                  </div>

                  {/* Chin Area */}
                  <div className="absolute bottom-4 left-4 right-4 h-16 flex flex-col justify-end">
                    <div className="flex flex-col gap-1 w-full">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                        {selectedDate.date}
                      </label>
                      <div className="flex items-center gap-2 border-b-2 border-black pb-1">
                        <span className="flex-1 text-2xl font-['Caveat'] font-bold text-black leading-none -mb-1 truncate">
                          {selectedDate.mood}
                        </span>
                        <div className="bg-[#FF69B4] text-white border border-black text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          💕
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sticky Note */}
                  {selectedDate.summary && (
                    <div className="absolute inset-0 pointer-events-none overflow-visible">
                      <div
                        className="absolute top-[10%] -right-4 w-[120px] p-3 bg-[#FEF3C7] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] transform rotate-6 z-20 flex items-center justify-center text-center animate-bounce-in"
                      >
                        <p className="font-['Caveat'] text-black text-xl leading-none font-bold break-words">
                          {selectedDate.summary}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- MAIN APP (SAEED - Owner) ---
  return (
    <div className="h-[100dvh] w-full bg-[#FFE4E1] relative flex flex-col items-center justify-center overflow-hidden font-['Outfit'] selection:bg-[#FF69B4] selection:text-white">

      {/* Hidden Canvas for Capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* --- Brutal Pattern Background --- */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(#FF1493 2px, transparent 2px),
            linear-gradient(90deg, #FF1493 2px, transparent 2px)
          `,
          backgroundSize: '30px 30px'
        }}
      ></div>

      {/* --- Header --- */}
      <div className="absolute top-6 z-40 w-full px-4 flex items-center justify-between pointer-events-none">

        {/* Left: Calendar Button */}
        <button
          onClick={() => setShowCalendar(true)}
          className="pointer-events-auto bg-white border-4 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-y-[4px] active:shadow-none"
          title="Calendar & History"
        >
          <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Center: Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
          <div className="bg-white border-4 border-black px-4 py-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform -rotate-1">
            <h1 className="font-['Caveat'] text-3xl md:text-5xl text-black font-bold tracking-wider">
              SHAHOODTI
            </h1>
          </div>
        </div>

        {/* Right: Streak Counter - Pink Heart */}
        <div className="pointer-events-auto bg-[#FF69B4] text-white border-4 border-black px-3 py-1.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-2 flex items-center gap-1" title="Current Streak">
          <span className="font-['Outfit'] font-black text-lg">{streak}</span>
          <svg className="w-6 h-6 fill-current animate-pulse" viewBox="0 0 24 24">
            {/* Heart icon */}
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      </div>

      {/* --- Main Polaroid Frame --- */}
      <div className="relative z-10 w-[80vw] max-w-[360px] transition-transform duration-300 mt-4">

        {/* The Polaroid Card */}
        <div className="relative bg-white border-4 border-black p-3 pb-24 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4">

          {/* Photo Area (Square) */}
          <div className="w-full aspect-square border-2 border-black bg-black relative flex items-center justify-center overflow-hidden group">

            {/* Live Camera */}
            {!capturedImage && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            )}

            {/* Captured Image */}
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            )}

            {/* Camera Permission Error */}
            {!cameraActive && !capturedImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center">
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <p className="font-bold text-sm">Allow camera access</p>
                <button onClick={startCamera} className="mt-2 bg-white text-black px-3 py-1 text-xs font-bold uppercase">Enable</button>
              </div>
            )}

            {/* Retake Button Overlay (Only when image captured) */}
            {capturedImage && (
              <button
                onClick={retakePhoto}
                className="absolute top-2 left-2 bg-white/80 border-2 border-black p-2 rounded-full hover:bg-white transition-colors z-20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            )}

            {/* Gloss Overlay */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -translate-y-10 translate-x-10 pointer-events-none"></div>
          </div>

          {/* Polaroid Chin / Input Area */}
          <div className="absolute bottom-4 left-4 right-4 h-16 flex flex-col justify-end">
            <form onSubmit={handlePost} className="flex flex-col gap-1 w-full">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                How are you feeling today?
              </label>
              <div className="flex items-center gap-2 border-b-2 border-black pb-1 focus-within:border-[#FF69B4] transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMood}
                  onChange={(e) => setInputMood(e.target.value)}
                  placeholder="Type here..."
                  disabled={isGenerating}
                  className="flex-1 bg-transparent text-2xl font-['Caveat'] font-bold text-black placeholder:text-gray-300 focus:outline-none leading-none -mb-1"
                  autoComplete="off"
                />

                {/* Main Action Button (Camera/Save) */}
                <button
                  type="submit"
                  disabled={isGenerating || (!capturedImage && !cameraActive)}
                  className="text-black hover:text-[#FF69B4] disabled:text-gray-300 transition-colors transform active:scale-95 ml-1"
                >
                  {isGenerating ? (
                    <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    capturedImage ? (
                      <div className="bg-[#FF69B4] text-white border border-black text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-none transition-all">
                        SAVE
                      </div>
                    ) : (
                      <div className="bg-black text-white rounded-full w-8 h-8 flex items-center justify-center border-2 border-gray-200">
                        <div className="w-6 h-6 bg-white rounded-full border-2 border-black"></div>
                      </div>
                    )
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Sticky Notes (Generated from Mood) */}
          <div className="absolute inset-0 pointer-events-none">
            {wishes.map((wish) => (
              <div
                key={wish.id}
                className="absolute max-w-[120px] p-3 transition-transform flex items-center justify-center text-center group border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] bg-[#FEF3C7] animate-bounce-in"
                style={{
                  ...wish.position,
                  backgroundColor: wish.color,
                  transform: `rotate(${wish.rotation}deg)`,
                  zIndex: 60,
                }}
              >
                <p className="font-['Caveat'] text-black text-xl leading-none font-bold">
                  {wish.text}
                </p>
              </div>
            ))}
          </div>

        </div>

        {/* Floating Add Note Button (Outside the frame) */}
        <button
          onClick={openNoteModal}
          disabled={isGenerating}
          className="absolute -bottom-28 -right-4 z-30 w-16 h-16 bg-[#FF69B4] border-4 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-110 hover:rotate-6 active:scale-95 transition-all transform rotate-6"
          title="Add a sticky note"
        >
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>

      </div>

      {/* --- Sticky Note Modal --- */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-[80vw] max-w-[300px] aspect-square bg-[#FEF3C7] border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-2 p-6 flex flex-col relative animate-bounce-in">
            <button
              onClick={closeNoteModal}
              className="absolute -top-4 -right-4 bg-white border-2 border-black rounded-full p-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <h3 className="font-['Caveat'] text-3xl font-bold text-center mb-2">Write a note...</h3>

            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="flex-1 bg-transparent border-none resize-none font-['Caveat'] text-2xl text-center focus:outline-none placeholder:text-black/20"
              placeholder="Make a wish or leave a memory..."
              autoFocus
            />

            <button
              onClick={handleStickNote}
              disabled={!noteInput.trim()}
              className="mt-2 bg-[#FF69B4] text-white border-2 border-black py-2 font-['Outfit'] font-bold uppercase tracking-wider shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:shadow-none disabled:translate-y-[3px] transition-all"
            >
              Stick it!
            </button>
          </div>
        </div>
      )}

      {/* --- Calendar Modal --- */}
      {showCalendar && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 animate-fade-in">
          <div className="bg-[#FFF0F5] w-full max-w-[500px] max-h-[90dvh] border-4 border-black flex flex-col shadow-2xl animate-slide-up overflow-hidden">
            {/* Modal Header with Navigation */}
            <div className="bg-white border-b-4 border-black p-3 flex justify-between items-center">
              <button
                onClick={goToPrevMonth}
                className="p-2 hover:bg-gray-100 rounded-full border-2 border-transparent hover:border-black transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>

              <div className="flex items-center gap-3">
                <h2 className="font-['Caveat'] text-2xl font-bold">
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                {/* Streak in Calendar */}
                <div className="bg-[#FF69B4] text-white border-2 border-black px-2 py-0.5 flex items-center gap-1 text-sm font-bold">
                  <span>{streak}</span>
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={goToNextMonth}
                  className="p-2 hover:bg-gray-100 rounded-full border-2 border-transparent hover:border-black transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                <button onClick={() => { setShowCalendar(false); setSelectedDate(null); setCalendarMonth(new Date()); }} className="p-2 hover:bg-gray-100 rounded-full border-2 border-transparent hover:border-black transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            {!selectedDate ? (
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className="font-bold text-xs text-gray-400">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {renderCalendar()}
                </div>
              </div>
            ) : (
              // Single Day View - Polaroid List (Scrollable if multiple)
              <div className="flex-1 p-6 flex flex-col items-center overflow-y-auto min-h-0 w-full gap-8">
                {(selectedDayMemories.length > 0 ? selectedDayMemories : [selectedDate]).map((memory, index) => (
                  <div key={memory.id} className="relative bg-white border-4 border-black p-3 pb-24 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col w-full max-w-[320px] transform shrink-0 transition-transform hover:scale-[1.02] last:mb-8" style={{ rotate: index % 2 === 0 ? '1deg' : '-1deg' }}>

                    {/* Photo Area */}
                    <div className="w-full aspect-square border-2 border-black bg-black relative flex items-center justify-center overflow-hidden">
                      <img src={memory.imageUrl} className="w-full h-full object-cover" alt="Memory" />
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -translate-y-10 translate-x-10 pointer-events-none"></div>
                    </div>

                    {/* Chin Area */}
                    <div className="absolute bottom-4 left-4 right-4 h-16 flex flex-col justify-end">
                      <div className="flex flex-col gap-1 w-full">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                          {memory.date}
                        </label>
                        <div className="flex items-center gap-2 border-b-2 border-black pb-1">
                          <span className="flex-1 text-2xl font-['Caveat'] font-bold text-black leading-none -mb-1 truncate">
                            {memory.mood}
                          </span>
                          {/* Read-only 'Saved' Badge */}
                          <div className="bg-[#FF69B4] text-white border border-black text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            SAVED
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sticky Note */}
                    {memory.summary && (
                      <div className="absolute inset-0 pointer-events-none overflow-visible">
                        <div
                          className="absolute top-[10%] -right-4 w-[120px] p-3 bg-[#FEF3C7] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] transform rotate-6 z-20 flex items-center justify-center text-center animate-bounce-in"
                        >
                          <p className="font-['Caveat'] text-black text-xl leading-none font-bold break-words">
                            {memory.summary}
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                ))}

                <button onClick={() => { setSelectedDate(null); setSelectedDayMemories([]); }} className="mt-4 font-['Outfit'] font-bold uppercase tracking-widest text-xs border-b-2 border-black pb-1 hover:text-[#FF69B4] hover:border-[#FF69B4] transition-colors mb-8">
                  Back to Calendar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
