import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, XCircle, Plus, Trash2, ChevronLeft, ChevronRight, Utensils, Zap, Edit2, Scale, Droplets, Minus, History, Smile, BookOpen, Check } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, doc, collection, addDoc, deleteDoc, onSnapshot, query, serverTimestamp, setDoc, orderBy } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

// Types
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'water' | 'tooth' | 'book';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonType = 'button' | 'submit' | 'reset';

interface Meal {
  id: string;
  type: MealType;
  food: string;
  proteinEstimate: number;
  kcalEstimate: number;
  quantity: number;
  unit: string;
  foodKey: string;
  date: string;
  adherence: boolean;
  timestamp?: { seconds: number };
}

interface WeightLog {
  id: string;
  weight: number;
  date: string;
  timestamp: number;
  userId?: string;
}

interface WaterLog {
  id: string;
  date: string;
  amount: number;
  timestamp: number;
}

interface ToothLog {
  id: string;
  date: string;
  timestamp: number;
}

interface BookLog {
  id: string;
  date: string;
  timestamp: number;
}

interface MealState {
  type: MealType;
  foodKey: keyof typeof FOOD_DB;
  quantity: number;
  customFood: string;
  customProtein: number;
  customKcal: number;
  adherence: boolean;
}

// Reemplaza la parte de __firebase_config con esto:
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Elimina la línea: const appId = __app_id;
// Y reemplaza donde se use `appId` por una string fija como "fit-tracker-v1"
const appId = "fit-tracker-prod"; 


// --- Food Database (PROTEIN & CALORIE ENGINE v1.4) ---
const FOOD_DB = {
  // Carnes y Pescados
  'pollo': { name: 'Pechuga de Pollo', ratio: 0.31, kcal_ratio: 1.65, unit: 'gramos', category: 'Carnes' },
  'salmon': { name: 'Salmón', ratio: 0.20, kcal_ratio: 2.08, unit: 'gramos', category: 'Carnes' },
  'pescado': { name: 'Pescado Blanco', ratio: 0.20, kcal_ratio: 0.90, unit: 'gramos', category: 'Carnes' },
  'atun': { name: 'Atún en Agua', ratio: 0.25, kcal_ratio: 1.16, unit: 'gramos', category: 'Carnes' },
  'pavo': { name: 'Carne Molida Pavo', ratio: 0.22, kcal_ratio: 1.50, unit: 'gramos', category: 'Carnes' },
  'jamon': { name: 'Jamón de Pavo', ratio: 0.18, kcal_ratio: 1.10, unit: 'gramos', category: 'Carnes' },
  
  // Huevo y Lácteos
  'claras': { name: 'Claras de Huevo', ratio: 3.6, kcal_ratio: 17, unit: 'unidades', category: 'Lacteos' },
  'huevo': { name: 'Huevo Entero', ratio: 6, kcal_ratio: 72, unit: 'unidades', category: 'Lacteos' },
  'cottage': { name: 'Queso Cottage', ratio: 0.12, kcal_ratio: 0.98, unit: 'gramos', category: 'Lacteos' },
  'panela': { name: 'Queso Panela', ratio: 0.18, kcal_ratio: 2.50, unit: 'gramos', category: 'Lacteos' },
  'yogur': { name: 'Yogur Griego', ratio: 0.10, kcal_ratio: 0.59, unit: 'gramos', category: 'Lacteos' },
  
  // Vegetal / Granos
  'lentejas': { name: 'Lentejas (Cocidas)', ratio: 0.09, kcal_ratio: 1.16, unit: 'gramos', category: 'Vegetal' },
  'frijoles': { name: 'Frijoles (Cocidos)', ratio: 0.08, kcal_ratio: 1.30, unit: 'gramos', category: 'Vegetal' },
  'avena': { name: 'Avena (Cocida)', ratio: 0.025, kcal_ratio: 0.70, unit: 'gramos', category: 'Vegetal' },
  'quinoa': { name: 'Quinoa (Cocida)', ratio: 0.04, kcal_ratio: 1.20, unit: 'gramos', category: 'Vegetal' },
  'arroz': { name: 'Arroz (Cocido)', ratio: 0.025, kcal_ratio: 1.30, unit: 'gramos', category: 'Vegetal' },
  
  // Suplementos
  'batido_pro': { name: 'Mi Batido (240ml Leche + 2 Scoops)', ratio: 36.5, kcal_ratio: 260, unit: 'batidos', category: 'Suplementos' },
  'whey': { name: 'Proteína Whey (1 Scoop)', ratio: 24, kcal_ratio: 120, unit: 'scoops', category: 'Suplementos' },
  'barrita': { name: 'Barrita de Proteína', ratio: 20, kcal_ratio: 200, unit: 'unidades', category: 'Suplementos' },
  
  // Custom
  'custom': { name: 'Otro (Personalizado)', ratio: 1, kcal_ratio: 0, unit: 'n/a', category: 'Otros' }
};

const DEFAULT_MEAL_STATE: MealState = {
  type: 'breakfast',
  foodKey: 'pollo',
  quantity: 100,
  customFood: '',
  customProtein: 0,
  customKcal: 0, 
  adherence: true
};

// --- Helper Components ---

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (() => void) | ((e: React.FormEvent) => void);
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  type?: ButtonType;
  size?: ButtonSize;
  id?: string;
}

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button', size = 'md', id }: ButtonProps) => {
  const baseStyle = "rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95";
  const sizes: Record<ButtonSize, string> = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-lg"
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20",
    secondary: "bg-slate-700 hover:bg-slate-600 text-slate-200",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20",
    ghost: "hover:bg-slate-800 text-slate-400 hover:text-white",
    water: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20",
    tooth: "bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20",
    book: "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
  };

  return (
    <button 
      id={id}
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${sizes[size]} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
};

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card = ({ children, className = '' }: CardProps) => (
  <div className={`bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden ${className}`}>
    {children}
  </div>
);

interface BadgeProps {
  type: MealType;
}

const Badge = ({ type }: BadgeProps) => {
  const styles: Record<MealType, string> = {
    breakfast: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    lunch: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dinner: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    snack: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  };
  
  const labels: Record<MealType, string> = {
    breakfast: "Desayuno",
    lunch: "Almuerzo",
    dinner: "Cena",
    snack: "Snack"
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${styles[type] || styles.snack}`}>
      {labels[type] || type}
    </span>
  );
};

// --- Main Application Component ---

export default function FitTracker() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]); 
  const [toothLogs, setToothLogs] = useState<ToothLog[]>([]);
  const [bookLogs, setBookLogs] = useState<BookLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [showWeightHistory, setShowWeightHistory] = useState(false); 
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [newMeal, setNewMeal] = useState<MealState>(DEFAULT_MEAL_STATE);
  const [newWeight, setNewWeight] = useState('');
  
  const [view, setView] = useState<'daily' | 'report'>('daily'); 

  // Auth & Data Fetching
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        console.log('🔐 Usuario autenticado en Firebase:', { uid: currentUser.uid, isAnonymous: currentUser.isAnonymous });
        setUser(currentUser);
        
        // 1. Fetch Meals
        const qMeals = query(collection(db, `artifacts/${appId}/users/${currentUser.uid}/meals`));
        const subMeals = onSnapshot(qMeals, (snap) => {
          const data: Meal[] = snap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() as Omit<Meal, 'id'>, 
            timestamp: (doc.data().timestamp as {seconds: number}) || {seconds:0} 
          }));
          data.sort((a,b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
          console.log('📥 Comidas recibidas de Firebase:', data.length, 'registros');
          setMeals(data);
        }, (error) => {
          console.error('❌ Error al obtener comidas:', error);
        });

        // 2. Fetch Weight
        const qWeight = query(collection(db, `artifacts/${appId}/users/${currentUser.uid}/weight_logs`), orderBy('date', 'asc'));
        const subWeight = onSnapshot(qWeight, (snap) => {
          const data: WeightLog[] = snap.docs.map(d => ({id: d.id, ...d.data()} as WeightLog));
          console.log('📥 Pesos recibidos de Firebase:', data.length, 'registros');
          setWeightLogs(data);
        }, (error) => {
          console.error('❌ Error al obtener pesos:', error);
        });

        // 3. Fetch Water
        const qWater = query(collection(db, `artifacts/${appId}/users/${currentUser.uid}/water_logs`));
        const subWater = onSnapshot(qWater, (snap) => {
          const data: WaterLog[] = snap.docs.map(d => ({id: d.id, ...d.data()} as WaterLog));
          console.log('📥 Agua recibida de Firebase:', data.length, 'registros');
          setWaterLogs(data);
        }, (error) => {
          console.error('❌ Error al obtener agua:', error);
        });

        // 4. Fetch Teeth Logs
        const qTeeth = query(collection(db, `artifacts/${appId}/users/${currentUser.uid}/tooth_logs`));
        const subTeeth = onSnapshot(qTeeth, (snap) => {
          const data: ToothLog[] = snap.docs.map(d => ({id: d.id, ...d.data()} as ToothLog));
          console.log('📥 Cepillados recibidos de Firebase:', data.length, 'registros');
          setToothLogs(data);
        }, (error) => {
          console.error('❌ Error al obtener cepillados:', error);
        });

        // 5. Fetch Book Logs
        const qBook = query(collection(db, `artifacts/${appId}/users/${currentUser.uid}/book_logs`));
        const subBook = onSnapshot(qBook, (snap) => {
          const data: BookLog[] = snap.docs.map(d => ({id: d.id, ...d.data()} as BookLog));
          console.log('📥 Lecturas recibidas de Firebase:', data.length, 'registros');
          setBookLogs(data);
        }, (error) => {
          console.error('❌ Error al obtener lecturas:', error);
        });

        setLoading(false);
        return () => { subMeals(); subWeight(); subWater(); subTeeth(); subBook(); };
      } else {
        signInAnonymously(auth);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- Calculations ---
  const formatDateKey = (date: Date): string => date.toISOString().split('T')[0];
  const currentDayKey = formatDateKey(selectedDate);
  const currentDayMeals = meals.filter(m => m.date === currentDayKey);
  const currentWater = waterLogs.filter(w => w.date === currentDayKey).reduce((acc, curr) => acc + curr.amount, 0);
  const currentTeeth = toothLogs.filter(t => t.date === currentDayKey).length;
  const currentBook = bookLogs.some(b => b.date === currentDayKey); // True if read today

  const calculatedNutrition = useMemo(() => {
    if (newMeal.foodKey === 'custom') {
      return { protein: Number(newMeal.customProtein) || 0, kcal: Number(newMeal.customKcal) || 0 };
    }
    const food = FOOD_DB[newMeal.foodKey as keyof typeof FOOD_DB];
    if (!food) return { protein: 0, kcal: 0 };
    return {
        protein: Math.round(newMeal.quantity * food.ratio),
        kcal: Math.round(newMeal.quantity * food.kcal_ratio)
    };
  }, [newMeal.foodKey, newMeal.quantity, newMeal.customProtein, newMeal.customKcal]);
  
  const selectedFoodUnit = FOOD_DB[newMeal.foodKey as keyof typeof FOOD_DB]?.unit || 'gramos';

  // --- Actions ---

  const openModal = (mealToEdit: Meal | null = null) => {
    if (mealToEdit) {
      setEditingMeal(mealToEdit);
      setNewMeal({
        type: mealToEdit.type,
        foodKey: 'custom' as keyof typeof FOOD_DB,
        quantity: 0,
        customFood: mealToEdit.food,
        customProtein: mealToEdit.proteinEstimate,
        customKcal: mealToEdit.kcalEstimate || 0,
        adherence: mealToEdit.adherence
      });
    } else {
      setEditingMeal(null);
      setNewMeal(DEFAULT_MEAL_STATE);
    }
    setIsModalOpen(true);
  };

  const handleSaveMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const userUid = user.uid;
    const mealToSave = {
      type: newMeal.type,
      adherence: newMeal.adherence,
      date: currentDayKey,
      food: newMeal.foodKey === 'custom' ? newMeal.customFood : FOOD_DB[newMeal.foodKey as keyof typeof FOOD_DB].name,
      proteinEstimate: calculatedNutrition.protein,
      kcalEstimate: calculatedNutrition.kcal,
      quantity: newMeal.quantity,
      unit: selectedFoodUnit,
      foodKey: newMeal.foodKey,
    };
    try {
      if (editingMeal) {
        await setDoc(doc(db, `artifacts/${appId}/users/${userUid}/meals`, editingMeal.id), { ...editingMeal, ...mealToSave });
        console.log('✅ Comida actualizada en Firebase:', mealToSave);
      } else {
        const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userUid}/meals`), { ...mealToSave, timestamp: serverTimestamp(), userId: userUid });
        console.log('✅ Comida guardada en Firebase:', { id: docRef.id, ...mealToSave });
      }
      setIsModalOpen(false);
    } catch (error) { 
      console.error('❌ Error al guardar comida:', error); 
    }
  };

  const handleDeleteMeal = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/meals`, id));
      console.log('✅ Comida eliminada de Firebase:', id);
    } catch (error) {
      console.error('❌ Error al eliminar comida:', error);
    }
  };

  // --- Water Actions ---
  const addWater = async () => {
      if (!user) return;
      try {
        const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${user.uid}/water_logs`), {
            date: currentDayKey, amount: 1, timestamp: serverTimestamp()
        });
        console.log('✅ Agua guardada en Firebase:', { id: docRef.id, date: currentDayKey, amount: 1 });
      } catch (error) {
        console.error('❌ Error al guardar agua:', error);
      }
  };

  const removeWater = async () => {
      if (!user) return;
      const todaysLogs = waterLogs.filter(w => w.date === currentDayKey).sort((a,b) => b.timestamp - a.timestamp);
      if(todaysLogs.length > 0) {
          try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/water_logs`, todaysLogs[0].id));
            console.log('✅ Agua eliminada de Firebase:', todaysLogs[0].id);
          } catch (error) {
            console.error('❌ Error al eliminar agua:', error);
          }
      }
  };

  // --- Tooth Actions ---
  const toggleTooth = async () => {
    if (!user || currentTeeth >= 3) return;
    try {
      const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${user.uid}/tooth_logs`), {
          date: currentDayKey, timestamp: serverTimestamp()
        });
      console.log('✅ Cepillado guardado en Firebase:', { id: docRef.id, date: currentDayKey });
    } catch (error) {
      console.error('❌ Error al guardar cepillado:', error);
    }
  };

  const removeTooth = async () => {
    if (!user) return;
    const todaysLogs = toothLogs.filter(t => t.date === currentDayKey).sort((a,b) => b.timestamp - a.timestamp);
    if(todaysLogs.length > 0) {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/tooth_logs`, todaysLogs[0].id));
        console.log('✅ Cepillado eliminado de Firebase:', todaysLogs[0].id);
      } catch (error) {
        console.error('❌ Error al eliminar cepillado:', error);
      }
    }
  };

  // --- Book Actions ---
  const toggleBook = async () => {
    if (!user) return;
    if (currentBook) {
        // Remove logs for today
        const todaysLogs = bookLogs.filter(b => b.date === currentDayKey);
        try {
          for (const log of todaysLogs) {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/book_logs`, log.id));
          }
          console.log('✅ Lectura eliminada de Firebase:', todaysLogs.length, 'registros');
        } catch (error) {
          console.error('❌ Error al eliminar lectura:', error);
        }
    } else {
        // Add log
        try {
          const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${user.uid}/book_logs`), {
              date: currentDayKey, timestamp: serverTimestamp()
          });
          console.log('✅ Lectura guardada en Firebase:', { id: docRef.id, date: currentDayKey });
        } catch (error) {
          console.error('❌ Error al guardar lectura:', error);
        }
    }
  };

  // --- Weight Actions ---
  const handleSaveWeight = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!user || !newWeight) return;
      const userUid = user.uid;
      try {
        const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userUid}/weight_logs`), {
            weight: parseFloat(newWeight), date: currentDayKey, timestamp: serverTimestamp(), userId: userUid
        });
        console.log('✅ Peso guardado en Firebase:', { id: docRef.id, weight: parseFloat(newWeight), date: currentDayKey });
        setIsWeightModalOpen(false); 
        setNewWeight('');
      } catch (error) {
        console.error('❌ Error al guardar peso:', error);
      }
  };
  const deleteWeight = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/weight_logs`, id));
      console.log('✅ Peso eliminado de Firebase:', id);
    } catch (error) {
      console.error('❌ Error al eliminar peso:', error);
    }
  };
  
  // --- Report Gen ---
  const generateWeeklyReport = () => {
    const report = meals.slice(0, 30).reduce((acc: Record<string, { totalProtein: number; totalKcal: number; cheats: number; meals: Meal[] }>, meal) => {
      if (!acc[meal.date]) acc[meal.date] = { totalProtein: 0, totalKcal: 0, cheats: 0, meals: [] };
      acc[meal.date].totalProtein += Number(meal.proteinEstimate) || 0;
      acc[meal.date].totalKcal += Number(meal.kcalEstimate) || 0;
      if (!meal.adherence) acc[meal.date].cheats += 1;
      acc[meal.date].meals.push(meal);
      return acc;
    }, {});
    
    const waterStats = waterLogs.reduce((acc: Record<string, number>, log) => { acc[log.date] = (acc[log.date] || 0) + 1; return acc; }, {});
    const toothStats = toothLogs.reduce((acc: Record<string, number>, log) => { acc[log.date] = (acc[log.date] || 0) + 1; return acc; }, {});
    const bookStats = bookLogs.reduce((acc: Record<string, boolean>, log) => { acc[log.date] = true; return acc; }, {}); // Map of dates read

    const sortedWeights = [...weightLogs].sort((a,b) => b.timestamp - a.timestamp);
    const currentW = sortedWeights[0]?.weight;
    const wDiff = sortedWeights.length > 1 ? Number((currentW - sortedWeights[1].weight).toFixed(2)) : 0;

    let txt = `📋 *REPORTE FIT-TRACKER v1.6*\nID: ${user?.uid.slice(0,5)}...\n`;
    if(currentW) txt += `⚖️ Peso: ${currentW}kg (${wDiff > 0 ? '+' : ''}${wDiff})\n\n`;

    Object.keys(report).sort().forEach(date => {
      const d = report[date];
      const w = waterStats[date] || 0;
      const t = toothStats[date] || 0;
      const b = bookStats[date] ? "📖 Leído" : "No leído";
      const status = d.cheats === 0 ? "✅" : "⚠️";
      txt += `📅 *${date}* ${status}\n   🥩 ${d.totalProtein}g Prot | 🔥 ${d.totalKcal} kcal\n   💧 ${w} vasos | 🦷 ${t}/3 | ${b}\n`;
      if (d.cheats > 0) txt += `   ❌ Cheat: ${d.meals.filter((m: Meal) => !m.adherence).map((m: Meal) => m.food).join(", ")}\n`;
      txt += "\n";
    });
    
    txt += "Gemi, ¿opiniones?";
    navigator.clipboard.writeText(txt);
    const btn = document.getElementById('copy-btn');
    if(btn) { const t = btn.innerText; btn.innerText = "¡Copiado!"; setTimeout(() => btn.innerText = t, 2000); }
  };
  
  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-900 text-blue-400 font-mono">Cargando v1.6...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      
      {/* Navbar */}
      <header className="bg-slate-800/50 backdrop-blur-md border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Zap className="text-blue-500 w-6 h-6" />
            <h1 className="font-bold text-lg md:text-xl tracking-tight">Fit<span className="text-blue-500">Tracker</span></h1>
          </div>
          <div className="text-xs font-mono text-slate-500">v1.6</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Toggler */}
        <div className="flex p-1 bg-slate-800 rounded-lg border border-slate-700">
          <button onClick={() => setView('daily')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${view === 'daily' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Diario</button>
          <button onClick={() => setView('report')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${view === 'report' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Reporte</button>
        </div>

        {view === 'daily' ? (
          <>
            {/* Date Nav */}
            <div className="flex items-center justify-between bg-slate-800 p-4 md:p-5 rounded-xl border border-slate-700 shadow-lg max-w-4xl mx-auto">
              <Button variant="ghost" onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))}><ChevronLeft className="w-5 h-5" /></Button>
              <div className="text-center">
                <h2 className="text-lg md:text-xl font-bold text-white capitalize">{selectedDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              </div>
              <Button variant="ghost" onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))}><ChevronRight className="w-5 h-5" /></Button>
            </div>

            {/* Main Content - Responsive Grid */}
            <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {/* WATER TRACKER */}
              <Card className="p-4 md:p-5 border-cyan-900/30 bg-gradient-to-br from-slate-800 to-slate-800/50 flex flex-col justify-between md:col-span-1">
                  <div className="flex justify-between items-start mb-2">
                      <div className="bg-cyan-500/20 p-2 rounded-full"><Droplets className="w-4 h-4 md:w-5 md:h-5 text-cyan-400"/></div>
                      <span className="text-xl md:text-2xl font-bold text-white">{currentWater}</span>
                  </div>
                  <div className="text-xs md:text-sm font-bold text-cyan-500 uppercase mb-3">Hidratación</div>
                  <div className="flex gap-2 justify-between">
                      <Button variant="ghost" size="sm" onClick={removeWater} disabled={currentWater===0} className="flex-1"><Minus className="w-3 h-3 md:w-4 md:h-4"/></Button>
                      <Button variant="water" size="sm" onClick={addWater} className="flex-1"><Plus className="w-3 h-3 md:w-4 md:h-4"/></Button>
                  </div>
                  <div className="mt-3 h-1.5 md:h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all duration-500" style={{width: `${Math.min((currentWater/12)*100, 100)}%`}}></div>
                  </div>
              </Card>

              {/* HABITS STACK (TEETH + BOOK) */}
              <div className="flex flex-col gap-4 md:col-span-1">
                {/* TOOTH */}
                <Card className="p-3 md:p-4 border-purple-900/30 bg-gradient-to-br from-slate-800 to-slate-800/50 flex-1 flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                        <Smile className="w-4 h-4 md:w-5 md:h-5 text-purple-400"/>
                        <span className="font-bold text-white text-lg md:text-xl">{currentTeeth}/3</span>
                    </div>
                    {/* Visual Teeth */}
                    <div className="flex justify-center gap-1.5 mb-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i <= currentTeeth ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]' : 'bg-slate-700'}`} />
                        ))}
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={removeTooth} disabled={currentTeeth===0} className="flex-1 px-0"><Minus className="w-3 h-3"/></Button>
                        <Button variant="tooth" size="sm" onClick={toggleTooth} disabled={currentTeeth>=3} className="flex-1 px-0"><Plus className="w-3 h-3"/></Button>
                    </div>
                </Card>

                {/* BOOK (NEW) */}
                <Card className={`p-3 md:p-4 border-amber-900/30 transition-all ${currentBook ? 'bg-amber-900/20 border-amber-500/50' : 'bg-gradient-to-br from-slate-800 to-slate-800/50'} flex-1 flex flex-col justify-between`}>
                     <div className="flex justify-between items-center mb-2">
                        <BookOpen className={`w-4 h-4 md:w-5 md:h-5 ${currentBook ? 'text-amber-400' : 'text-slate-500'}`}/>
                        <span className={`text-xs md:text-sm font-bold uppercase ${currentBook ? 'text-amber-400' : 'text-slate-500'}`}>{currentBook ? 'Leído' : 'Lectura'}</span>
                     </div>
                     <button 
                        onClick={toggleBook}
                        className={`w-full py-1.5 rounded-lg flex items-center justify-center gap-2 transition-all text-xs font-bold ${currentBook ? 'bg-amber-500 text-white shadow-lg shadow-amber-900/40' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                     >
                        {currentBook ? <Check className="w-3 h-3" /> : 'Marcar'}
                     </button>
                </Card>
              </div>

              {/* Stats Grid */}
              <Card className="p-4 md:p-5 flex flex-col items-center bg-gradient-to-br from-slate-800 to-slate-800/50 col-span-2 md:col-span-1">
                <span className="text-slate-400 text-xs md:text-sm uppercase font-bold mb-1">Proteína</span>
                <div className="flex items-end gap-1">
                    <span className="text-3xl md:text-4xl font-bold text-blue-400">{currentDayMeals.reduce((acc, m) => acc + Number(m.proteinEstimate), 0)}</span>
                    <span className="text-sm md:text-base text-slate-500 mb-1">g</span>
                </div>
                <span className="text-xs md:text-sm text-slate-500 mt-1">Meta: 160g</span>
              </Card>
              <Card className="p-4 md:p-5 flex flex-col items-center bg-gradient-to-br from-slate-800 to-slate-800/50 border-orange-900/10 col-span-2 md:col-span-1">
                <span className="text-slate-400 text-xs md:text-sm uppercase font-bold mb-1">Calorías (Est)</span>
                <div className="flex items-end gap-1">
                    <span className="text-3xl md:text-4xl font-bold text-orange-400">{currentDayMeals.reduce((acc, m) => acc + Number(m.kcalEstimate || 0), 0)}</span>
                    <span className="text-sm md:text-base text-slate-500 mb-1">kcal</span>
                </div>
                <span className="text-xs md:text-sm text-slate-500 mt-1">Meta: ~1750</span>
              </Card>
            </div>

            {/* Meals Section - Full Width */}
            <div className="max-w-4xl mx-auto w-full">
              {/* Meals List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-slate-300 font-semibold flex items-center gap-2 text-base md:text-lg"><Utensils className="w-4 h-4 md:w-5 md:h-5" /> Comidas</h3>
                  <Button onClick={() => openModal()} variant="success" size="sm" className="md:text-base"><Plus className="w-4 h-4" /> Registrar</Button>
                </div>

              {currentDayMeals.length === 0 ? (
                <div className="text-center py-8 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                  <p className="text-slate-500 text-sm">Sin registros hoy.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentDayMeals.map((meal) => (
                    <div key={meal.id} className={`group relative flex items-center justify-between p-3 md:p-4 rounded-xl border transition-all ${meal.adherence ? 'bg-slate-800 border-slate-700' : 'bg-red-900/10 border-red-900/30'} hover:shadow-lg`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${meal.adherence ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge type={meal.type} />
                            <span className="text-slate-200 font-medium text-sm md:text-base">{meal.food}</span>
                          </div>
                          <div className="text-xs md:text-sm text-slate-500 flex gap-2">
                            <span className="text-blue-400 font-mono">{meal.proteinEstimate}p</span>
                            <span className="text-orange-400 font-mono">{meal.kcalEstimate || 0}kcal</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex opacity-0 md:opacity-100 group-hover:opacity-100 transition-opacity gap-1">
                        <button onClick={() => openModal(meal)} className="p-2 text-slate-500 hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4 md:w-5 md:h-5" /></button>
                        <button onClick={() => handleDeleteMeal(meal.id)} className="p-2 text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4 md:w-5 md:h-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </>
        ) : (
          /* Report View */
          <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
            <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 p-6 md:p-8 rounded-2xl border border-blue-500/20 text-center space-y-4">
              <h2 className="text-xl md:text-2xl font-bold text-white">Reporte Semanal</h2>
              <Button id="copy-btn" onClick={generateWeeklyReport} className="w-full md:w-auto md:px-8 justify-center md:text-base">Copiar Resumen</Button>
            </div>

            {/* Weight Module v1.4 (With History) */}
            <Card className="p-6 md:p-8 border-emerald-900/30">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-300 flex items-center gap-2"><Scale className="w-5 h-5 text-emerald-400" /> Peso</h3>
                    <div className="flex gap-2">
                        <Button onClick={() => setShowWeightHistory(!showWeightHistory)} variant="ghost" size="sm"><History className="w-4 h-4"/></Button>
                        <Button onClick={() => setIsWeightModalOpen(true)} variant="secondary" size="sm"><Plus className="w-3 h-3" /></Button>
                    </div>
                </div>

                {showWeightHistory ? (
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Historial de Registros</h4>
                        {weightLogs.slice().sort((a,b)=>b.timestamp-a.timestamp).map(log => (
                            <div key={log.id} className="flex justify-between items-center p-2 bg-slate-900 rounded border border-slate-700">
                                <span className="text-sm text-slate-300">{log.date}</span>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-emerald-400">{log.weight} kg</span>
                                    <button onClick={() => deleteWeight(log.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3"/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={weightLogs}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" hide />
                                <YAxis stroke="#94a3b8" fontSize={12} domain={['dataMin - 1', 'dataMax + 1']} />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={3} dot={{fill: '#10b981'}} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </Card>
          </div>
        )}
      </main>

      {/* Meals Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl border border-slate-700 p-4 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 className="font-bold text-white">{editingMeal ? 'Editar' : 'Registrar'}</h3>
                <button onClick={() => setIsModalOpen(false)}><XCircle className="w-6 h-6 text-slate-500 hover:text-white" /></button>
            </div>
            <form onSubmit={handleSaveMeal} className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(t => (
                    <button key={t} type="button" onClick={() => setNewMeal({...newMeal, type: t})} className={`text-xs py-2 rounded-md border ${newMeal.type === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                      {t === 'breakfast' ? 'Desayuno' : t === 'lunch' ? 'Almuerzo' : t === 'dinner' ? 'Cena' : 'Snack'}
                    </button>
                  ))}
              </div>
              <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white" value={newMeal.foodKey} onChange={(e) => setNewMeal({...newMeal, foodKey: e.target.value as keyof typeof FOOD_DB})}>
                  {Object.keys(FOOD_DB).map(k => <option key={k} value={k}>{FOOD_DB[k as keyof typeof FOOD_DB].name}</option>)}
              </select>
              {newMeal.foodKey === 'custom' ? (
                <div className="space-y-2">
                    <input type="text" placeholder="Nombre" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white" value={newMeal.customFood} onChange={(e) => setNewMeal({...newMeal, customFood: e.target.value})} />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="number" placeholder="Prot (g)" className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white" value={newMeal.customProtein} onChange={(e) => setNewMeal({...newMeal, customProtein: Number(e.target.value) || 0})} />
                        <input type="number" placeholder="Kcal" className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white" value={newMeal.customKcal} onChange={(e) => setNewMeal({...newMeal, customKcal: Number(e.target.value) || 0})} />
                    </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                        <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white" value={newMeal.quantity} onChange={(e) => setNewMeal({...newMeal, quantity: Number(e.target.value) || 0})} />
                        <span className="absolute right-3 top-3 text-xs text-slate-500">{selectedFoodUnit}</span>
                    </div>
                    <div className="flex flex-col justify-center text-xs text-slate-400 pl-2">
                        <span>🥩 {calculatedNutrition.protein}g Prot</span>
                        <span>🔥 {calculatedNutrition.kcal} kcal</span>
                    </div>
                </div>
              )}
               <button type="button" onClick={() => setNewMeal({...newMeal, adherence: !newMeal.adherence})} className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 ${newMeal.adherence ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}`}>
                  {newMeal.adherence ? <><CheckCircle className="w-4 h-4"/> En Plan</> : <><XCircle className="w-4 h-4"/> Cheat Meal</>}
               </button>
              <Button type="submit" onClick={handleSaveMeal} className="w-full">Guardar</Button>
            </form>
          </div>
        </div>
      )}

      {/* Weight Modal */}
      {isWeightModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 w-full max-w-xs rounded-2xl shadow-2xl border border-slate-700 p-6 space-y-6">
                <div className="flex justify-between"><h3 className="font-bold text-white">Registrar Peso</h3><button onClick={() => setIsWeightModalOpen(false)}><XCircle className="w-6 h-6 text-slate-500"/></button></div>
                <div className="relative max-w-[120px] mx-auto">
                    <input type="number" step="0.1" placeholder="0.0" className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl p-4 text-center text-3xl font-bold text-emerald-400 focus:outline-none focus:border-emerald-500" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} autoFocus />
                    <span className="absolute right-2 bottom-5 text-slate-500 font-bold">kg</span>
                </div>
                <Button variant="success" type="submit" onClick={handleSaveWeight} className="w-full">Guardar</Button>
            </div>
          </div>
      )}
    </div>
  );
}