
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { AppView, InspectionProfile, InspectionSection, ItemStatus, InspectionChecklistItem } from './types';
import { generateInspectionPlan, detectPropertyDetails, analyzeInspectionImage, generateSingleSection, generateSectionItems } from './services/geminiService';
import { saveReportToSupabase, loadReportFromSupabase, authService } from './services/supabaseService';
import { DynamicIcon, Icons } from './components/Icons';
import { CameraView } from './components/CameraView';
import { AuthView } from './components/Auth';

// --------------------------------------------------------------------------
// Constants: InterNACHI Standards of Practice
// --------------------------------------------------------------------------
const SOP_DATA = [
  {
    title: "1. Roof",
    items: [
      "Inspect the roof-covering materials.",
      "Inspect the gutters.",
      "Inspect the downspouts.",
      "Inspect the vents, flashing, skylights, chimney and other roof penetrations.",
      "Inspect the general structure of the roof from the readily accessible panels, doors or stairs.",
      "Describe the type of roof-covering materials."
    ]
  },
  {
    title: "2. Exterior",
    items: [
      "Inspect the exterior wall-covering materials.",
      "Inspect the eaves, soffits and fascia.",
      "Inspect a representative number of windows.",
      "Inspect all exterior doors.",
      "Inspect flashing and trim.",
      "Inspect adjacent walkways and driveways.",
      "Inspect stairs, steps, stoops, stairways and ramps.",
      "Inspect porches, patios, decks, balconies and carports.",
      "Inspect railings, guards and handrails.",
      "Inspect vegetation, surface drainage, retaining walls and grading."
    ]
  },
  {
    title: "3. Basement, Foundation, Crawlspace & Structure",
    items: [
      "Inspect the foundation.",
      "Inspect the basement.",
      "Inspect the crawlspace.",
      "Inspect the structural components.",
      "Describe the type of foundation.",
      "Report indications of wood in contact with or near soil.",
      "Report indications of active water penetration.",
      "Report indications of possible foundation movement."
    ]
  },
  {
    title: "4. Heating",
    items: [
      "Inspect the heating system using normal operating controls.",
      "Describe the location of the thermostat.",
      "Describe the energy source.",
      "Describe the heating method.",
      "Report if the heating system did not operate.",
      "Report if the heating system was deemed inaccessible."
    ]
  },
  {
    title: "5. Cooling",
    items: [
      "Inspect the cooling system using normal operating controls.",
      "Describe the location of the thermostat.",
      "Describe the cooling method.",
      "Report if the cooling system did not operate.",
      "Report if the cooling system was inaccessible."
    ]
  },
  {
    title: "6. Plumbing",
    items: [
      "Inspect the main water supply shut-off valve.",
      "Inspect the main fuel supply shut-off valve.",
      "Inspect water heating equipment (energy source, venting, TPR valves, seismic bracing).",
      "Inspect interior water supply (fixtures/faucets) by running water.",
      "Inspect toilets for proper operation by flushing.",
      "Inspect sinks, tubs and showers for functional drainage.",
      "Inspect the drain, waste and vent system.",
      "Inspect drainage sump pumps with accessible floats."
    ]
  },
  {
    title: "7. Electrical",
    items: [
      "Inspect the service drop.",
      "Inspect the overhead service conductors and attachment point.",
      "Inspect the service head, gooseneck and drip loops.",
      "Inspect the service mast, service conduit and raceway.",
      "Inspect the electric meter and base.",
      "Inspect the service-entrance conductors.",
      "Inspect the main service disconnect.",
      "Inspect panelboards and over-current protection devices.",
      "Inspect service grounding and bonding.",
      "Inspect a representative number of switches, lighting fixtures and receptacles.",
      "Inspect all GFCI receptacles and breakers.",
      "Inspect smoke and carbon-monoxide detectors."
    ]
  },
  {
    title: "8. Fireplace",
    items: [
      "Inspect readily accessible and visible portions of fireplaces and chimneys.",
      "Inspect lintels above fireplace openings.",
      "Inspect damper doors by opening and closing them.",
      "Inspect cleanout doors and frames.",
      "Report joint separation, damage or deterioration of the hearth.",
      "Report lack of smoke/CO detectors in the same room."
    ]
  },
  {
    title: "9. Attic, Insulation & Ventilation",
    items: [
      "Inspect insulation in unfinished spaces.",
      "Inspect ventilation of unfinished spaces (attics, crawlspaces).",
      "Inspect mechanical exhaust systems in kitchen, bathrooms and laundry.",
      "Describe the type of insulation observed.",
      "Report general absence of insulation or ventilation."
    ]
  },
  {
    title: "10. Doors, Windows & Interior",
    items: [
      "Inspect a representative number of doors and windows.",
      "Inspect floors, walls and ceilings.",
      "Inspect stairs, steps, landings, stairways and ramps.",
      "Inspect railings, guards and handrails.",
      "Inspect garage vehicle doors and openers (using normal controls).",
      "Report improper spacing between balusters/spindles.",
      "Report photo-electric safety sensors that do not operate properly."
    ]
  }
];

// --------------------------------------------------------------------------
// Helper Components
// --------------------------------------------------------------------------

interface SelectionTagsProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  label?: string;
}

const SelectionTags: React.FC<SelectionTagsProps> = ({ options, value, onChange, label }) => (
  <div className="mb-4">
    {label && <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</label>}
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border ${
            value === opt
              ? 'bg-chrp-teal text-white border-chrp-teal shadow-sm dark:text-slate-900'
              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-chrp-teal hover:text-chrp-teal hover:bg-teal-50 dark:hover:bg-slate-700'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

interface SwipeableItemProps {
  children: React.ReactNode;
  onHide: () => void;
  isExpanded: boolean;
}

const SwipeableItem: React.FC<SwipeableItemProps> = ({ 
  children, 
  onHide, 
  isExpanded 
}) => {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);

  // Unified Start Handler
  const handleStart = (clientX: number) => {
    if (isExpanded) return;
    startX.current = clientX;
    isDragging.current = true;
  };

  // Unified Move Handler
  const handleMove = (clientX: number) => {
    if (isExpanded || !isDragging.current) return;
    
    const diff = clientX - startX.current;

    // Only allow swiping left (negative diff)
    if (diff < 0) {
       // Add resistance past -80px
       const restrictedDiff = diff < -80 ? -80 + (diff + 80) * 0.2 : diff;
       setOffset(Math.max(restrictedDiff, -150));
    }
  };

  // Unified End Handler
  const handleEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    // Snap logic - simplified threshold
    if (offset < -40) {
      setOffset(-80); // Snap open
    } else {
      setOffset(0); // Snap close
    }
  };

  return (
    <div className="relative mb-4 group">
       {/* Background Action Layer (Always rendered behind) */}
       <div className="absolute inset-0 flex justify-end rounded-xl overflow-hidden">
          <button 
             className="w-24 bg-slate-400 dark:bg-slate-600 flex items-center justify-center text-white cursor-pointer active:bg-slate-500 transition-colors"
             onClick={(e) => {
                e.stopPropagation();
                onHide();
                setOffset(0);
             }}
          >
             <div className="flex flex-col items-center">
                <Icons.EyeOff size={24} />
                <span className="text-[10px] font-bold uppercase mt-1">Hide</span>
             </div>
          </button>
       </div>

       {/* Foreground Content Layer (Slides over background) */}
       <div 
         className="relative z-10 bg-white dark:bg-slate-900 rounded-xl transition-transform duration-200 ease-out"
         style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
         
         // Touch Events
         onTouchStart={(e) => handleStart(e.touches[0].clientX)}
         onTouchMove={(e) => handleMove(e.touches[0].clientX)}
         onTouchEnd={handleEnd}
         
         // Mouse Events (for desktop testing)
         onMouseDown={(e) => handleStart(e.clientX)}
         onMouseMove={(e) => handleMove(e.clientX)}
         onMouseUp={handleEnd}
         onMouseLeave={handleEnd}

         onClick={() => {
             // Close if open and clicked
             if (offset < -10) setOffset(0);
         }}
       >
          {children}
       </div>
    </div>
  );
};

// Simple Modal for Inputs
interface InputModalProps {
  title: string;
  placeholder: string;
  onConfirm: (val: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const InputModal: React.FC<InputModalProps> = ({ title, placeholder, onConfirm, onCancel, isLoading }) => {
  const [val, setVal] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{title}</h3>
        <input
          autoFocus
          type="text"
          className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-4 focus:ring-2 focus:ring-chrp-teal focus:outline-none text-slate-900 dark:text-white placeholder-slate-400"
          placeholder={placeholder}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && val && !isLoading) onConfirm(val);
          }}
        />
        <div className="flex gap-2">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(val)}
            className="flex-1 py-3 bg-chrp-teal text-chrp-dark font-bold rounded-xl flex items-center justify-center"
            disabled={!val || isLoading}
          >
            {isLoading ? <Icons.Loader2 className="animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Map Modal Component
interface MapModalProps {
  address: string;
  googleMapsUrl?: string;
  onClose: () => void;
}

const MapModal: React.FC<MapModalProps> = ({ address, googleMapsUrl, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[70vh]" onClick={e => e.stopPropagation()}>
         <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
               <Icons.MapPin className="text-chrp-teal" /> Property Location
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full">
               <Icons.XCircle className="text-slate-500" />
            </button>
         </div>
         <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative">
            <iframe 
               width="100%" 
               height="100%" 
               frameBorder="0" 
               scrolling="no" 
               marginHeight={0} 
               marginWidth={0} 
               src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
               className="absolute inset-0 w-full h-full"
            ></iframe>
         </div>
         {googleMapsUrl && (
             <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-center">
                <a 
                   href={googleMapsUrl} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                   <Icons.MapPin size={16} /> Open in Google Maps (Official)
                </a>
             </div>
         )}
      </div>
    </div>
  );
};

// Standards Modal
interface StandardsModalProps {
  onClose: () => void;
}

const StandardsModal: React.FC<StandardsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-[80vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
           <div className="flex items-center gap-3">
             <div className="p-2 bg-chrp-teal/10 rounded-lg text-chrp-teal">
                <Icons.BookOpen size={24} />
             </div>
             <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Standards of Practice</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Based on InterNACHI Guidelines</p>
             </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400">
             <Icons.XCircle size={24} />
           </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
           <p className="text-sm text-slate-600 dark:text-slate-300 italic bg-blue-50 dark:bg-slate-800 p-4 rounded-lg border border-blue-100 dark:border-slate-700 mb-4">
              Note: This is a summarized reference checklist based on the International Standards of Practice for Performing a General Home Inspection.
           </p>
           {SOP_DATA.map((section, idx) => (
             <div key={idx} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 font-bold text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-700">
                   {section.title}
                </div>
                <ul className="p-4 space-y-2">
                   {section.items.map((item, i) => (
                     <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Icons.CheckCircle className="text-chrp-teal shrink-0 mt-0.5" size={16} />
                        <span>{item}</span>
                     </li>
                   ))}
                </ul>
             </div>
           ))}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center">
           <button onClick={onClose} className="bg-slate-800 dark:bg-slate-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-slate-700 dark:hover:bg-slate-600">
             Close Reference
           </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<AppView>(AppView.LANDING);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  
  // Setup State
  const [address, setAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string | undefined>(undefined);
  const [propType, setPropType] = useState('Ranch');
  const [floors, setFloors] = useState(1);
  const [baths, setBaths] = useState(1);
  const [beds, setBeds] = useState(3);
  const [yearBuilt, setYearBuilt] = useState('');
  
  // Additional Property Details
  const [sqft, setSqft] = useState('');
  const [occupancy, setOccupancy] = useState('Occupied');
  const [pets, setPets] = useState('');

  // Environmental State
  const [weather, setWeather] = useState('Sunny');
  const [tempOutside, setTempOutside] = useState('');
  const [tempInside, setTempInside] = useState('70');

  // Utilities State
  const [gasType, setGasType] = useState('Natural Gas');
  const [sewerType, setSewerType] = useState('Public');
  const [waterType, setWaterType] = useState('Public');
  const [electricPanel, setElectricPanel] = useState('200 Amp');
  const [generatorType, setGeneratorType] = useState('None');

  // Data State
  const [inspection, setInspection] = useState<InspectionProfile | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [analyzingItemId, setAnalyzingItemId] = useState<string | null>(null);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  
  // UI Modal States
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<{
    sectionId: string, 
    itemId?: string 
  } | null>(null);

  // --------------------------------------------------------------------------
  // Startup Logic
  // --------------------------------------------------------------------------
  
  useEffect(() => {
    // Check system preference for dark mode
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }

    // Check Auth Status
    const checkAuth = async () => {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
    };
    checkAuth();

    const checkUrlForReport = async () => {
        const params = new URLSearchParams(window.location.search);
        const reportId = params.get('id');
        
        if (reportId) {
            setLoadingText('Loading saved report...');
            setView(AppView.LOADING);
            try {
                const loadedProfile = await loadReportFromSupabase(reportId);
                if (loadedProfile) {
                    hydrateFromProfile(loadedProfile);
                    setInspection(loadedProfile);
                    setView(AppView.DASHBOARD);
                } else {
                    alert("Report not found or could not be loaded.");
                    setView(AppView.LANDING);
                }
            } catch (e) {
                console.error(e);
                alert("Error loading report.");
                setView(AppView.LANDING);
            }
        }
    };
    
    checkUrlForReport();
  }, []);

  // Update HTML class for Tailwind dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const hydrateFromProfile = (profile: InspectionProfile) => {
    setAddress(profile.address);
    if (profile.googleMapsUrl) setGoogleMapsUrl(profile.googleMapsUrl);
    setPropType(profile.propertyType);
    setFloors(profile.floors);
    setBaths(profile.baths);
    setBeds(profile.bedrooms);
    setYearBuilt(profile.yearBuilt || '');
    setSqft(profile.sqft?.toString() || '');
    setOccupancy(profile.occupancy || 'Occupied');
    setPets(profile.pets || '');
    setWeather(profile.weather || '');
    setTempOutside(profile.temperatureOutside || '');
    setTempInside(profile.temperatureInside || '');
    setGasType(profile.gasType || '');
    setSewerType(profile.sewerType || '');
    setWaterType(profile.waterType || '');
    setElectricPanel(profile.electricPanel || '');
    setGeneratorType(profile.generatorType || '');
  };

  // --------------------------------------------------------------------------
  // Auth Handlers
  // --------------------------------------------------------------------------

  const handleLogout = async () => {
    await authService.signOut();
    setUser(null);
    setView(AppView.LANDING);
  };

  const handleAuthSuccess = async () => {
    const currentUser = await authService.getCurrentUser();
    setUser(currentUser);
    
    // If we have an active inspection, assume user wanted to "Sign In to Save"
    // so we keep them on the Dashboard or Report view.
    // Otherwise, go to Landing.
    if (inspection) {
        setView(AppView.DASHBOARD);
    } else {
        setView(AppView.LANDING);
    }
  };

  // --------------------------------------------------------------------------
  // AI Handlers
  // --------------------------------------------------------------------------

  const handleAutoDetect = async () => {
    if (!address) return;
    setIsLoading(true);
    setLoadingText('Searching public records & weather...');
    setGoogleMapsUrl(undefined);
    
    try {
      const details = await detectPropertyDetails(address);
      
      // Check if we actually got data back
      if (Object.keys(details).length === 0) {
        alert("Could not automatically find details for this address. Please enter them manually.");
      } else {
        if (details.formattedAddress) setAddress(details.formattedAddress);
        if (details.googleMapsUrl) setGoogleMapsUrl(details.googleMapsUrl);
        if (details.propertyType) setPropType(details.propertyType);
        if (details.floors) setFloors(details.floors);
        if (details.baths) setBaths(details.baths);
        if (details.bedrooms) setBeds(details.bedrooms);
        if (details.yearBuilt) setYearBuilt(details.yearBuilt);
        if (details.sqft) setSqft(details.sqft.toString());
        
        // Auto-fill weather if found
        if (details.currentTemp) setTempOutside(details.currentTemp.replace(/[^0-9.]/g, ''));
        if (details.currentWeather) {
           const w = details.currentWeather.toLowerCase();
           if (w.includes('rain') || w.includes('drizzle')) setWeather('Rainy');
           else if (w.includes('cloud')) setWeather('Cloudy');
           else if (w.includes('snow')) setWeather('Snowy');
           else if (w.includes('overcast')) setWeather('Overcast');
           else setWeather('Sunny');
        }

        // Auto-fill utilities if found
        if (details.gasType) setGasType(details.gasType);
        if (details.sewerType) setSewerType(details.sewerType);
        if (details.waterType) setWaterType(details.waterType);
      }
    } catch (e) {
      console.error(e);
      alert("Error connecting to search service. Please enter details manually.");
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  };

  const handleStartInspection = useCallback(async () => {
    if (!address || !propType) return;
    
    setIsLoading(true);
    setLoadingText('Generating inspection protocol...');
    setView(AppView.LOADING);

    try {
      const sections = await generateInspectionPlan(address, propType, floors, baths, beds);
      
      const newProfile: InspectionProfile = {
        id: Date.now().toString(),
        userId: user?.id,
        address,
        googleMapsUrl,
        propertyType: propType,
        floors,
        baths,
        bedrooms: beds,
        sqft: sqft ? parseInt(sqft) : undefined,
        yearBuilt,
        occupancy,
        pets,
        weather,
        temperatureOutside: tempOutside,
        temperatureInside: tempInside,
        gasType,
        sewerType,
        waterType,
        electricPanel,
        generatorType,
        inspectorName: user ? user.email?.split('@')[0] || "Inspector" : "Guest Inspector",
        createdAt: new Date().toISOString(),
        sections
      };

      setInspection(newProfile);
      setView(AppView.DASHBOARD);
    } catch (e) {
      console.error(e);
      alert("Failed to generate inspection plan. Please try again.");
      setView(AppView.SETUP);
    } finally {
      setIsLoading(false);
    }
  }, [
    address, googleMapsUrl, propType, floors, baths, beds, yearBuilt, sqft, occupancy, pets,
    weather, tempOutside, tempInside, 
    gasType, sewerType, waterType, electricPanel, generatorType, user
  ]);

  const processImageAnalysis = async (sectionId: string, itemId: string, imageData: string) => {
    if (!inspection) return;
    
    // Find item details for context
    const section = inspection.sections.find(s => s.id === sectionId);
    const item = section?.items.find(i => i.id === itemId);
    
    if (item) {
      setAnalyzingItemId(itemId);
      try {
        const description = await analyzeInspectionImage(imageData, item.label, item.status);
        
        // Append or set note
        setInspection(prev => {
          if (!prev) return null;
          return {
            ...prev,
            sections: prev.sections.map(sec => 
              sec.id !== sectionId ? sec : {
                ...sec,
                items: sec.items.map(i => i.id === itemId ? { 
                  ...i, 
                  notes: i.notes ? `${i.notes}\nAI Note: ${description}` : description 
                } : i)
              }
            )
          };
        });
      } catch (e) {
        console.error("AI Analysis failed", e);
      } finally {
        setAnalyzingItemId(null);
      }
    }
  };

  const handleAddSection = async (prompt: string) => {
    if (!inspection) return;
    setIsLoading(true);
    try {
      const newSection = await generateSingleSection(prompt);
      if (newSection) {
        setInspection(prev => prev ? {
          ...prev,
          sections: [...prev.sections, newSection]
        } : null);
        setShowAddSectionModal(false);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to create section.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddItem = async (prompt: string) => {
    if (!inspection || !activeSectionId) return;
    setIsLoading(true);
    
    const section = inspection.sections.find(s => s.id === activeSectionId);
    if (!section) return;

    try {
      const newItems = await generateSectionItems(section.title, prompt);
      if (newItems.length > 0) {
        setInspection(prev => prev ? {
          ...prev,
          sections: prev.sections.map(s => s.id !== activeSectionId ? s : {
            ...s,
            items: [...s.items, ...newItems]
          })
        } : null);
        setShowAddItemModal(false);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to create items.");
    } finally {
      setIsLoading(false);
    }
  };

  const constructShareUrl = (id: string) => {
    // Generate clean URL without double slashes
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const separator = pathname.endsWith('/') ? '' : '/';
    return `${origin}${pathname}${separator}?id=${id}`;
  };
  
  const handleSaveReport = async () => {
    if (!inspection) return;
    setIsLoading(true);
    setLoadingText('Saving to cloud...');
    try {
        const { uuid, shortId } = await saveReportToSupabase(inspection);
        
        // Update local state with the new IDs
        setInspection(prev => prev ? ({ 
            ...prev, 
            savedReportId: uuid,
            shortId: shortId
        }) : null);
        
        const idToUse = shortId || uuid;
        const newUrl = constructShareUrl(idToUse);
        
        const isBlob = window.location.protocol === 'blob:';
        try {
            // Attempt to update history state
            // Skip if protocol is blob: as it throws security errors
            if (!isBlob) {
               window.history.pushState({path: newUrl}, '', newUrl);
            }
        } catch (urlError) {
            console.debug("History update skipped:", urlError);
        }

        setShareUrl(newUrl);
        
    } catch (e: any) {
        console.error("Save error", e);
        let msg = "Failed to save report.";
        if (typeof e === 'string') msg = e;
        else if (e instanceof Error) msg = e.message;
        else if (e?.message) msg = e.message;
        
        alert(`Error: ${msg}`);
    } finally {
        setIsLoading(false);
        setLoadingText('');
    }
  };

  const handleShareClick = () => {
    if (!inspection) return;
    const id = inspection.shortId || inspection.savedReportId;
    if (id) {
        setShareUrl(constructShareUrl(id));
    }
  };

  // --------------------------------------------------------------------------
  // Data Mutators
  // --------------------------------------------------------------------------

  const updateItemStatus = (sectionId: string, itemId: string, status: ItemStatus) => {
    if (!inspection) return;
    setInspection(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sections: prev.sections.map(sec => {
          if (sec.id !== sectionId) return sec;
          
          const updatedItems = sec.items.map(item => 
            item.id === itemId ? { ...item, status } : item
          );
          
          // Calculate section status
          const total = updatedItems.length;
          const untouched = updatedItems.filter(i => i.status === 'untouched').length;
          const completed = total - untouched;
          
          let newStatus: InspectionSection['status'] = 'pending';
          if (completed === total) newStatus = 'completed';
          else if (completed > 0) newStatus = 'in-progress';

          return { ...sec, items: updatedItems, status: newStatus };
        })
      };
    });
  };

  const updateItemOption = (sectionId: string, itemId: string, selectedOption: string) => {
    if (!inspection) return;
    setInspection(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sections: prev.sections.map(sec => 
          sec.id !== sectionId ? sec : {
            ...sec,
            items: sec.items.map(item => item.id === itemId ? { ...item, selectedOption } : item)
          }
        )
      };
    });
  };

  const updateItemNote = (sectionId: string, itemId: string, notes: string) => {
    if (!inspection) return;
    setInspection(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sections: prev.sections.map(sec => 
          sec.id !== sectionId ? sec : {
            ...sec,
            items: sec.items.map(item => item.id === itemId ? { ...item, notes } : item)
          }
        )
      };
    });
  };

  const toggleItemVisibility = (sectionId: string, itemId: string, isHidden: boolean) => {
     if (!inspection) return;
     setInspection(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sections: prev.sections.map(sec => 
          sec.id !== sectionId ? sec : {
            ...sec,
            items: sec.items.map(item => item.id === itemId ? { ...item, isHidden } : item)
          }
        )
      };
    });
  };

  const handleCapturePhoto = (imageData: string) => {
    if (!inspection || !cameraTarget) return;

    setInspection(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sections: prev.sections.map(sec => {
          if (sec.id !== cameraTarget.sectionId) return sec;

          // If target is an item
          if (cameraTarget.itemId) {
            return {
              ...sec,
              items: sec.items.map(item => 
                item.id === cameraTarget.itemId 
                  ? { ...item, photos: [...item.photos, imageData] }
                  : item
              )
            };
          }
          
          // If target is section (cover photo)
          return { ...sec, photoUrl: imageData };
        })
      };
    });

    // Trigger AI Analysis if it's an item
    if (cameraTarget.itemId) {
      processImageAnalysis(cameraTarget.sectionId, cameraTarget.itemId, imageData);
    }

    setCameraActive(false);
    setCameraTarget(null);
  };

  const deletePhoto = (sectionId: string, itemId: string, photoIndex: number) => {
     if (!inspection) return;
     setInspection(prev => {
      if (!prev) return null;
      return {
        ...prev,
        sections: prev.sections.map(sec => 
          sec.id !== sectionId ? sec : {
            ...sec,
            items: sec.items.map(item => 
              item.id !== itemId ? item : {
                ...item,
                photos: item.photos.filter((_, idx) => idx !== photoIndex)
              }
            )
          }
        )
      };
    });
  };

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  const calculateProgress = () => {
    if (!inspection) return 0;
    // Calculate total excluding hidden items
    const visibleItems = inspection.sections.flatMap(s => s.items).filter(i => !i.isHidden);
    const totalItems = visibleItems.length;
    const completedItems = visibleItems.filter(i => i.status !== 'untouched').length;
    
    if (totalItems === 0) return 0;
    return Math.round((completedItems / totalItems) * 100);
  };

  const getStatusColor = (status: ItemStatus) => {
    switch (status) {
      case 'pass': return 'bg-green-500 text-white';
      case 'info': return 'bg-blue-500 text-white';
      case 'attention': return 'bg-yellow-500 text-white';
      case 'moderate': return 'bg-orange-500 text-white';
      case 'dangerous': return 'bg-red-600 text-white';
      default: return 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500';
    }
  };

  const getStatusLabel = (status: ItemStatus) => {
    switch (status) {
      case 'pass': return 'Good';
      case 'info': return 'Info';
      case 'attention': return 'Check';
      case 'moderate': return 'Defect';
      case 'dangerous': return 'Hazard';
      default: return '';
    }
  };

  const getStatusIcon = (status: ItemStatus) => {
     switch (status) {
      case 'pass': return Icons.ShieldCheck;
      case 'info': return Icons.Info;
      case 'attention': return Icons.AlertTriangle;
      case 'moderate': return Icons.AlertTriangle;
      case 'dangerous': return Icons.Skull;
      default: return Icons.Circle;
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (cameraActive) {
    return (
      <CameraView 
        onCapture={handleCapturePhoto} 
        onClose={() => {
          setCameraActive(false);
          setCameraTarget(null);
        }} 
      />
    );
  }
  
  // Auth View Overlay
  if (view === AppView.AUTH) {
    return (
        <AuthView 
            onSuccess={handleAuthSuccess} 
            onCancel={() => inspection ? setView(AppView.DASHBOARD) : setView(AppView.LANDING)} 
        />
    );
  }

  // Wrapper with Dark Mode Class
  return (
    <div className={`transition-colors duration-300 min-h-screen ${darkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      
      {/* Floating Dark Mode Toggle */}
      <div className="fixed bottom-6 left-6 z-50 print:hidden">
        <button 
          onClick={toggleDarkMode}
          className="p-3 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg hover:scale-110 transition-transform"
          title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {darkMode ? <Icons.Sun size={20} /> : <Icons.Moon size={20} />}
        </button>
      </div>

      {/* View Logic */}
      {view === AppView.LOADING && (
        <div className="min-h-screen bg-chrp-dark flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-4 border-chrp-teal border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold text-white mb-2">{loadingText || 'Loading...'}</h2>
            <p className="text-slate-400 max-w-xs">Please wait while we process.</p>
        </div>
      )}

      {view === AppView.LANDING && (
        <div className="min-h-screen bg-chrp-dark relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-64 h-64 bg-chrp-teal opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-600 opacity-10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            
            {/* Header Login/Logout */}
            <div className="absolute top-6 right-6 z-50">
                {user ? (
                    <div className="flex items-center gap-3">
                        <span className="text-white text-sm hidden sm:inline">Hello, {user.email?.split('@')[0]}</span>
                        <button 
                            onClick={handleLogout}
                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={() => setView(AppView.AUTH)}
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                        Sign In
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 z-10">
            <div className="mb-8 p-4 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10">
                <Icons.FileText className="w-12 h-12 text-chrp-teal" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4 text-center">Chrp<span className="text-chrp-teal">Inspect</span></h1>
            <p className="text-slate-300 text-center mb-12 max-w-sm text-lg">
                AI-powered home inspections.
            </p>
            <button 
                onClick={() => setView(AppView.SETUP)}
                className="w-full max-w-xs bg-chrp-teal hover:bg-teal-400 text-chrp-dark font-bold py-4 px-8 rounded-xl shadow-lg shadow-teal-500/20 transition-all transform hover:scale-105"
            >
                Start Inspection
            </button>
            </div>
        </div>
      )}

      {view === AppView.SETUP && (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors">
            <div className="bg-chrp-dark p-6 pb-12 rounded-b-[2.5rem] shadow-xl">
                <button onClick={() => setView(AppView.LANDING)} className="text-white/60 mb-6 flex items-center gap-2">
                    <Icons.ChevronLeft size={20} /> Back
                </button>
                <h2 className="text-3xl font-bold text-white mb-2">New Inspection</h2>
                <p className="text-slate-400">Enter details manually or use AI to detect.</p>
            </div>

            <div className="flex-1 px-6 -mt-8 pb-10 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 space-y-6 border border-slate-100 dark:border-slate-800 transition-colors">
                
                {/* Address & AI Auto-fill */}
                <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Property Address</label>
                <div className="flex gap-2">
                    <input 
                    type="text" 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Maple Street"
                    className="flex-1 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal transition-all placeholder-slate-400"
                    />
                    <button 
                    onClick={handleAutoDetect}
                    disabled={!address || isLoading}
                    className="p-4 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border border-transparent dark:border-slate-700"
                    title="Auto-detect with AI"
                    >
                    {isLoading ? <Icons.Loader2 className="animate-spin" /> : <Icons.Search />}
                    </button>
                </div>
                </div>

                {/* Inline Map Preview */}
                {address && (
                   <div className="h-40 w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative">
                      <iframe 
                         width="100%" 
                         height="100%" 
                         frameBorder="0" 
                         scrolling="no" 
                         marginHeight={0} 
                         marginWidth={0} 
                         src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                         className="opacity-80 hover:opacity-100 transition-opacity"
                         title="Map Preview"
                      ></iframe>
                      {googleMapsUrl && (
                        <div className="absolute bottom-2 right-2">
                            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="bg-white/90 dark:bg-black/80 text-xs px-2 py-1 rounded shadow text-slate-800 dark:text-white flex items-center gap-1">
                                <Icons.MapPin size={10} /> Google Maps
                            </a>
                        </div>
                      )}
                   </div>
                )}
                
                {/* Property Type - TAGS */}
                <SelectionTags 
                    label="Property Type"
                    options={["Ranch", "Colonial", "High Ranch", "Bi-Level", "Split Level", "Cape Cod", "Victorian", "Modern", "Townhouse", "Condo"]}
                    value={propType}
                    onChange={setPropType}
                />

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Year Built</label>
                    <input 
                    type="text" 
                    placeholder="e.g. 1985"
                    value={yearBuilt}
                    onChange={(e) => setYearBuilt(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sq. Ft.</label>
                    <input 
                    type="number" 
                    value={sqft}
                    onChange={(e) => setSqft(e.target.value)}
                    placeholder="2000"
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Floors</label>
                    <input 
                    type="number" 
                    min="1" max="5"
                    value={floors}
                    onChange={(e) => setFloors(parseInt(e.target.value))}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Beds</label>
                    <input 
                    type="number" 
                    min="1" max="10"
                    value={beds}
                    onChange={(e) => setBeds(parseInt(e.target.value))}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Baths</label>
                    <input 
                    type="number" 
                    min="1" max="10"
                    value={baths}
                    onChange={(e) => setBaths(parseInt(e.target.value))}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                </div>

                {/* Occupancy - TAGS */}
                <SelectionTags 
                    label="Occupancy"
                    options={["Occupied", "Vacant", "Staged", "New Construction"]}
                    value={occupancy}
                    onChange={setOccupancy}
                />

                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Pets</label>
                    <input 
                    type="text" 
                    value={pets}
                    onChange={(e) => setPets(e.target.value)}
                    placeholder="e.g. 2 Dogs"
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>

                {/* Environmental */}
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">Environment</h3>
                <SelectionTags 
                    label="Weather Condition"
                    options={["Sunny", "Cloudy", "Overcast", "Rainy", "Snowy", "Windy"]}
                    value={weather}
                    onChange={setWeather}
                />
                
                <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Ext Temp (°F)</label>
                    <input 
                        type="number" 
                        value={tempOutside} 
                        onChange={(e) => setTempOutside(e.target.value)} 
                        placeholder="65"
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                <div className="col-span-1">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Int Temp (°F)</label>
                    <input 
                        type="number" 
                        value={tempInside} 
                        onChange={(e) => setTempInside(e.target.value)} 
                        placeholder="70"
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    />
                </div>
                </div>

                {/* Utilities Section */}
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">Utilities</h3>
                
                <SelectionTags 
                    label="Heating Fuel / Gas"
                    options={["Natural Gas", "Propane", "Oil", "Electric", "None"]}
                    value={gasType}
                    onChange={setGasType}
                />

                <SelectionTags 
                    label="Sewer Type"
                    options={["Public", "Septic", "Cesspool", "Unknown"]}
                    value={sewerType}
                    onChange={setSewerType}
                />

                <SelectionTags 
                    label="Water Source"
                    options={["Public", "Well", "Cistern", "Unknown"]}
                    value={waterType}
                    onChange={setWaterType}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Electric Panel</label>
                        <input 
                        type="text" 
                        value={electricPanel}
                        onChange={(e) => setElectricPanel(e.target.value)}
                        placeholder="e.g. 200 Amp"
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                        />
                    </div>
                    <div>
                        <SelectionTags 
                            label="Generator"
                            options={["None", "Portable", "Whole House"]}
                            value={generatorType}
                            onChange={setGeneratorType}
                        />
                    </div>
                </div>


                <div className="pt-4">
                <button 
                    onClick={handleStartInspection}
                    disabled={!address || !propType}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
                    address && propType 
                        ? 'bg-chrp-dark text-white hover:bg-slate-800 shadow-slate-900/20' 
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    Generate Protocol
                </button>
                </div>
            </div>
            </div>
        </div>
      )}

      {view === AppView.REPORT && inspection && (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col transition-colors">
            {/* Report Header */}
            <div className="bg-white dark:bg-slate-900 px-6 py-4 shadow-sm border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 print:hidden transition-colors">
                <div className="flex items-center justify-between">
                    <button 
                        onClick={() => setView(AppView.DASHBOARD)}
                        className="flex items-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    >
                        <Icons.ChevronLeft className="mr-1" /> Dashboard
                    </button>
                    <h1 className="font-bold text-lg text-slate-900 dark:text-white">Inspection Preview</h1>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleSaveReport}
                            disabled={isLoading}
                            className="flex items-center gap-2 bg-chrp-teal text-white px-4 py-2 rounded-lg hover:bg-teal-500 transition-colors shadow-sm"
                            title="Save Cloud Report"
                        >
                            {isLoading ? <Icons.Loader2 className="animate-spin" size={18} /> : <Icons.CloudUpload size={18} />}
                            <span className="hidden sm:inline">Save</span>
                        </button>
                        
                        {(inspection.shortId || inspection.savedReportId) && (
                            <button 
                                onClick={handleShareClick}
                                className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
                                title="Share Link"
                            >
                                <Icons.Share2 size={18} />
                                <span className="hidden sm:inline">Share</span>
                            </button>
                        )}

                        <button 
                            onClick={() => window.print()}
                            className="flex items-center gap-2 bg-chrp-dark text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                            title="Print Report"
                        >
                            <Icons.Printer size={18} />
                            <span className="hidden sm:inline">Print</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Share Modal Alert */}
            {shareUrl && (
            <div className="bg-green-100 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800 px-6 py-4 text-center print:hidden relative shadow-inner">
                <div className="max-w-xl mx-auto">
                    <p className="text-green-800 dark:text-green-300 text-sm font-bold mb-2 flex items-center justify-center gap-2">
                        <Icons.CheckCircle size={16} /> Report Link Ready
                    </p>
                    <div className="flex justify-center items-center gap-2">
                        <input 
                            readOnly 
                            value={shareUrl} 
                            className="flex-1 bg-white dark:bg-slate-800 px-3 py-2 rounded border border-green-300 dark:border-green-700 text-xs text-slate-600 dark:text-slate-300 focus:outline-none"
                        />
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(shareUrl);
                                alert("Link copied!");
                            }}
                            className="bg-green-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-green-700 transition-colors"
                        >
                            Copy
                        </button>
                    </div>
                </div>
                <button onClick={() => setShareUrl(null)} className="absolute right-4 top-1/2 -translate-y-1/2 text-green-700 dark:text-green-400 hover:text-green-900">
                    <Icons.XCircle size={20} />
                </button>
            </div>
            )}

            {/* Printable Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 print:p-0 print:overflow-visible">
                <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 print:bg-white rounded-xl shadow-lg print:shadow-none overflow-hidden print:w-full print:max-w-none transition-colors border border-transparent dark:border-slate-800">
                    
                    {/* Document Header */}
                    <div className="bg-chrp-dark text-white p-8 print:bg-slate-900 print:text-black">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl font-bold mb-2">Inspection Report</h1>
                                <p className="text-slate-400 text-lg print:text-slate-300">{inspection.address}</p>
                                
                                <div className="mt-4 flex gap-6 text-sm text-slate-300">
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-bold">Weather</span>
                                        {inspection.weather || 'Not recorded'}
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-bold">Outside Temp</span>
                                        {inspection.temperatureOutside ? `${inspection.temperatureOutside}°F` : 'N/A'}
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-bold">Inside Temp</span>
                                        {inspection.temperatureInside ? `${inspection.temperatureInside}°F` : 'N/A'}
                                    </div>
                                </div>
                                <div className="mt-2 flex gap-6 text-sm text-slate-300">
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-bold">Sq Ft</span>
                                        {inspection.sqft || 'N/A'}
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-bold">Occupancy</span>
                                        {inspection.occupancy || 'N/A'}
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-bold">Pets</span>
                                        {inspection.pets || 'None'}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-slate-400 text-sm">Date: {new Date(inspection.createdAt).toLocaleDateString()}</p>
                                <p className="text-slate-400 text-sm">{inspection.propertyType}</p>
                                <p className="text-slate-400 text-sm font-medium mt-1">
                                    {inspection.yearBuilt ? `Built: ${inspection.yearBuilt} • ` : ''}
                                    {inspection.bedrooms} Bed • {inspection.baths} Bath
                                </p>
                                <p className="text-slate-400 text-sm mt-2">Inspector: {inspection.inspectorName}</p>
                                {/* Display ID on printed report */}
                                {(inspection.shortId || inspection.savedReportId) && (
                                    <p className="text-slate-500 text-xs mt-4 print:block hidden">
                                        Report ID: {inspection.shortId || inspection.savedReportId}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Systems & Utilities Summary */}
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 print:bg-slate-50 grid grid-cols-2 md:grid-cols-5 gap-6">
                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Fuel / Gas</span>
                            <span className="font-semibold text-slate-800 dark:text-white print:text-slate-800">{inspection.gasType || 'Unknown'}</span>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Water</span>
                            <span className="font-semibold text-slate-800 dark:text-white print:text-slate-800">{inspection.waterType || 'Unknown'}</span>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Sewer</span>
                            <span className="font-semibold text-slate-800 dark:text-white print:text-slate-800">{inspection.sewerType || 'Unknown'}</span>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Electric</span>
                            <span className="font-semibold text-slate-800 dark:text-white print:text-slate-800">{inspection.electricPanel || 'Unknown'}</span>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Generator</span>
                            <span className="font-semibold text-slate-800 dark:text-white print:text-slate-800">{inspection.generatorType || 'None'}</span>
                        </div>
                    </div>

                    {/* Summary Section */}
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Inspection Summary</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white dark:bg-slate-800 print:bg-white p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Total Items</p>
                                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                                    {inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.length, 0)}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 print:bg-white p-4 rounded-lg border border-green-200 dark:border-green-900/50 shadow-sm">
                                <p className="text-green-600 dark:text-green-400 text-xs font-bold uppercase">Passed</p>
                                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                                    {inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.filter(i => i.status === 'pass').length, 0)}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 print:bg-white p-4 rounded-lg border border-red-200 dark:border-red-900/50 shadow-sm">
                                <p className="text-red-500 dark:text-red-400 text-xs font-bold uppercase">Issues Found</p>
                                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                                    {inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.filter(i => ['attention', 'moderate', 'dangerous'].includes(i.status)).length, 0)}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 print:bg-white p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                <p className="text-slate-400 text-xs font-bold uppercase">Remaining</p>
                                <p className="text-2xl font-bold text-slate-500 dark:text-slate-300">
                                    {inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.length, 0) - 
                                     inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.filter(i => i.status === 'pass').length, 0) - 
                                     inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.filter(i => ['attention', 'moderate', 'dangerous'].includes(i.status)).length, 0) - 
                                     inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).reduce((acc, s) => acc + s.items.filter(i => i.status === 'info').length, 0)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Sections */}
                    <div className="p-8 space-y-12">
                        {inspection.sections.map(s => ({...s, items: s.items.filter(i => !i.isHidden)})).map(section => (
                            <div key={section.id} className="break-inside-avoid">
                                {/* Section Header */}
                                <div className="flex items-center gap-3 mb-6 pb-2 border-b-2 border-slate-100 dark:border-slate-800">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                        <DynamicIcon name={section.iconName} className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">{section.title}</h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
                                    </div>
                                </div>

                                {/* Section Photo */}
                                {section.photoUrl && (
                                    <div className="mb-6 h-48 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                        <img src={section.photoUrl} className="w-full h-full object-cover" alt={section.title} />
                                    </div>
                                )}

                                {/* Items */}
                                <div className="space-y-6">
                                    {section.items.map(item => {
                                        
                                        return (
                                            <div key={item.id} className="border-l-4 border-slate-200 dark:border-slate-700 pl-4 py-1" style={{
                                                borderColor: item.status === 'dangerous' ? '#EF4444' : 
                                                            item.status === 'moderate' ? '#F97316' : 
                                                            item.status === 'attention' ? '#EAB308' : 
                                                            item.status === 'pass' ? '#22C55E' : undefined
                                            }}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusColor(item.status)}`}>
                                                            {getStatusLabel(item.status) || 'Pending'}
                                                        </span>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
                                                        {item.selectedOption && (
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full ml-2">
                                                            {item.selectedOption}
                                                        </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {item.notes && (
                                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 bg-slate-50 dark:bg-slate-800 p-2 rounded">
                                                        <span className="font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase mr-2">Note:</span>
                                                        {item.notes}
                                                    </p>
                                                )}

                                                {item.photos.length > 0 && (
                                                    <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                                        {item.photos.map((p, idx) => (
                                                            <img key={idx} src={p} className="h-20 w-20 object-cover rounded border border-slate-200 dark:border-slate-700" alt="Evidence" />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 print:bg-slate-50 p-8 text-center border-t border-slate-200 dark:border-slate-800">
                        <p className="text-slate-400 text-sm">Generated by ChrpInspect AI</p>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Dashboard View */}
      {view === AppView.DASHBOARD && (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors">
            {/* Dashboard Header */}
            <div className="bg-chrp-dark pt-12 pb-24 px-6 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-chrp-teal opacity-10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                
                {/* User Info / Logout (Header) */}
                <div className="absolute top-4 right-4 z-20">
                     {user && (
                        <div className="flex items-center gap-2">
                             <span className="text-white/70 text-xs hidden sm:inline">{user.email}</span>
                             <button 
                                onClick={handleLogout}
                                className="text-white/60 hover:text-white text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full transition-colors"
                             >
                                Logout
                             </button>
                        </div>
                     )}
                     {!user && (
                        <button 
                            onClick={() => setView(AppView.AUTH)}
                            className="text-white text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full hover:bg-white/20 transition-colors"
                        >
                            Sign In to Save
                        </button>
                     )}
                </div>

                <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Current Job</p>
                    <h1 className="text-2xl font-bold text-white truncate max-w-[250px]">{inspection?.address}</h1>
                    <p className="text-slate-400 text-sm">{inspection?.propertyType} • {inspection?.floors} Floor(s)</p>
                    </div>
                    <div className="flex gap-2">
                    <button
                        onClick={() => setShowMapModal(true)}
                        className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white transition-colors"
                        title="View Location Map"
                    >
                        <Icons.MapPin size={20} />
                    </button>
                    <button
                        onClick={() => setShowStandardsModal(true)}
                        className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white transition-colors"
                        title="Standards of Practice"
                    >
                        <Icons.BookOpen size={20} />
                    </button>
                    <button
                        onClick={handleSaveReport}
                        disabled={isLoading}
                        className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white transition-colors"
                        title="Save Report to Cloud"
                    >
                        {isLoading ? <Icons.Loader2 className="animate-spin" size={20} /> : <Icons.CloudUpload size={20} />}
                    </button>
                    </div>
                </div>
                
                <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-xs font-bold uppercase">Overall Progress</span>
                    <span className="text-chrp-teal font-bold text-sm">{calculateProgress()}%</span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div 
                    className="h-full bg-gradient-to-r from-chrp-teal to-blue-400 transition-all duration-1000"
                    style={{ width: `${calculateProgress()}%` }}
                    ></div>
                </div>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 px-6 -mt-16 pb-8 z-10">
                <div className="grid grid-cols-2 gap-4">
                {inspection?.sections.map(section => {
                    const isCompleted = section.status === 'completed';
                    const inProgress = section.status === 'in-progress';
                    // Count non-hidden items
                    const activeItems = section.items.filter(i => !i.isHidden);
                    const doneCount = activeItems.filter(i => i.status !== 'untouched').length;
                    
                    return (
                    <button
                        key={section.id}
                        onClick={() => {
                        setActiveSectionId(section.id);
                        setView(AppView.SECTION_DETAIL);
                        }}
                        className={`relative bg-white dark:bg-slate-900 p-4 pt-6 rounded-2xl shadow-sm border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col items-center text-center group ${
                        isCompleted 
                            ? 'border-teal-200 dark:border-teal-900' 
                            : inProgress 
                                ? 'border-blue-200 dark:border-blue-900' 
                                : 'border-slate-100 dark:border-slate-800'
                        }`}
                    >
                        {isCompleted && (
                        <div className="absolute top-3 right-3 text-chrp-teal">
                            <Icons.ShieldCheck size={18} />
                        </div>
                        )}
                        
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors shadow-sm ${
                        isCompleted 
                            ? 'bg-teal-50 dark:bg-teal-900/30 text-chrp-teal' 
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-500'
                        }`}>
                        <DynamicIcon name={section.iconName} className="w-6 h-6" />
                        </div>
                        
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1 leading-tight">{section.title}</h3>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">
                        {doneCount}/{activeItems.length} Checked
                        </p>
                    </button>
                    )
                })}
                
                {/* Add Section Button */}
                <button
                    onClick={() => setShowAddSectionModal(true)}
                    className="bg-slate-100 dark:bg-slate-900 p-4 pt-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:border-slate-400 transition-all"
                >
                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center mb-3 shadow-sm">
                    <Icons.Plus className="w-6 h-6 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-600 dark:text-slate-400 text-sm mb-1">Add Section</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Custom Area</p>
                </button>

                </div>
                
                <div className="mt-8 space-y-4">
                    {calculateProgress() === 100 ? (
                        <button 
                        onClick={() => setView(AppView.REPORT)}
                        className="w-full bg-chrp-teal text-chrp-dark font-bold py-4 rounded-xl shadow-lg shadow-teal-500/20 animate-pulse"
                        >
                            Finalize & Preview Report
                        </button>
                    ) : (
                        <button 
                        onClick={() => setView(AppView.REPORT)}
                        className="w-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                        >
                            View Report Preview
                        </button>
                    )}
                </div>
            </div>

            {/* Modal for Adding Section */}
            {showAddSectionModal && (
                <InputModal 
                title="Add Custom Section"
                placeholder="e.g. Pool House, Detached Garage, Wine Cellar..."
                isLoading={isLoading}
                onCancel={() => setShowAddSectionModal(false)}
                onConfirm={handleAddSection}
                />
            )}

            {/* Standards Modal */}
            {showStandardsModal && (
                <StandardsModal onClose={() => setShowStandardsModal(false)} />
            )}

            {/* Map Modal */}
            {showMapModal && inspection && (
                <MapModal 
                   address={inspection.address} 
                   googleMapsUrl={inspection.googleMapsUrl} 
                   onClose={() => setShowMapModal(false)} 
                />
            )}
        </div>
      )}
      
      {/* SECTION DETAIL View needs to be handled if it existed in previous App.tsx but here we just ensure Dashboard and Setup have the map */}
      {view === AppView.SECTION_DETAIL && activeSectionId && inspection && (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 sticky top-0 z-20 px-6 py-4 shadow-sm border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
                <button 
                onClick={() => setView(AppView.DASHBOARD)}
                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                <Icons.ChevronLeft className="text-slate-800 dark:text-white" size={24} />
                </button>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Inspection Area</span>
                <div className="w-10" />
            </div>
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-chrp-teal`}>
                <DynamicIcon name={inspection.sections.find(s => s.id === activeSectionId)?.iconName || 'box'} className="w-6 h-6" />
                </div>
                <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{inspection.sections.find(s => s.id === activeSectionId)?.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => !i.isHidden && i.status !== 'untouched').length} of {inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => !i.isHidden).length} inspected
                </p>
                </div>
            </div>
            <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                className="h-full bg-chrp-teal transition-all duration-500"
                style={{ width: `${(inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => !i.isHidden && i.status !== 'untouched').length || 0) / (inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => !i.isHidden).length || 1) * 100}%` }}
                ></div>
            </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 space-y-6 overflow-y-auto overflow-x-hidden">
            
            {/* Section Cover Photo */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Area Overview Photo</h3>
                <div 
                    onClick={() => {
                    setCameraTarget({ sectionId: activeSectionId });
                    setCameraActive(true);
                    }}
                    className="relative h-40 rounded-2xl bg-slate-200 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-chrp-teal transition-colors"
                >
                    {inspection.sections.find(s => s.id === activeSectionId)?.photoUrl ? (
                    <>
                        <img src={inspection.sections.find(s => s.id === activeSectionId)?.photoUrl} alt="Section" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icons.Camera className="text-white" size={24} />
                        </div>
                    </>
                    ) : (
                    <div className="flex flex-col items-center text-slate-400">
                        <Icons.Camera size={24} className="mb-2" />
                        <span className="text-sm font-medium">Add Cover Photo</span>
                    </div>
                    )}
                </div>
            </div>

            {/* Checklist Items */}
            <div className="space-y-4 pb-10">
                <div className="flex justify-between items-end">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inspection Items</h3>
                    <span className="text-[10px] text-slate-400 italic">Swipe left to hide items</span>
                </div>
                
                {inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => !i.isHidden).map(item => {
                const isExpanded = expandedItemId === item.id;
                const StatusIcon = getStatusIcon(item.status);

                return (
                    <SwipeableItem 
                    key={item.id} 
                    onHide={() => toggleItemVisibility(activeSectionId, item.id, true)}
                    isExpanded={isExpanded}
                    >
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors">
                        {/* Item Header / Toggle */}
                        <button
                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            className="w-full flex items-center p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <div className={`p-2 rounded-full mr-3 ${getStatusColor(item.status)}`}>
                                <StatusIcon size={16} />
                            </div>
                            <div className="flex-1">
                            <span className="font-medium text-slate-800 dark:text-slate-100 block">{item.label}</span>
                            {item.selectedOption && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">{item.selectedOption}</span>
                            )}
                            </div>
                            <div className="text-slate-400">
                                {isExpanded ? <Icons.ChevronUp size={20} /> : <Icons.ChevronDown size={20} />}
                            </div>
                        </button>

                        {/* Expanded Content */}
                        {isExpanded && (
                            <div className="p-4 pt-0 border-t border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                
                                {/* Status Selectors */}
                                <div className="py-4">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Condition</p>
                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                        {(['pass', 'info', 'attention', 'moderate', 'dangerous'] as ItemStatus[]).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => updateItemStatus(activeSectionId, item.id, s)}
                                                className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all ${
                                                    item.status === s 
                                                        ? 'border-transparent shadow-md ' + getStatusColor(s)
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                                }`}
                                            >
                                                {React.createElement(getStatusIcon(s), { size: 20, className: "mb-1" })}
                                                <span className="text-[10px] font-bold uppercase">{getStatusLabel(s)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Options Selector (If Available) - TAGS */}
                                {item.options && item.options.length > 0 && (
                                <div className="mb-4">
                                    <SelectionTags 
                                        label="Specification"
                                        options={item.options}
                                        value={item.selectedOption || ''}
                                        onChange={(val) => updateItemOption(activeSectionId, item.id, val)}
                                    />
                                </div>
                                )}

                                {/* Notes */}
                                <div className="mb-4 relative">
                                    <div className="flex justify-between items-end mb-2">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notes</p>
                                    {analyzingItemId === item.id && (
                                        <span className="text-xs text-chrp-teal animate-pulse flex items-center">
                                        <Icons.Loader2 size={12} className="mr-1 animate-spin" /> AI Analyzing photo...
                                        </span>
                                    )}
                                    </div>
                                    <textarea
                                        value={item.notes}
                                        onChange={(e) => updateItemNote(activeSectionId, item.id, e.target.value)}
                                        placeholder="Take a photo to auto-generate description, or type here..."
                                        className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-chrp-teal focus:outline-none"
                                        rows={2}
                                    />
                                </div>

                                {/* Photos */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Evidence Photos</p>
                                        <button 
                                            onClick={() => {
                                                setCameraTarget({ sectionId: activeSectionId, itemId: item.id });
                                                setCameraActive(true);
                                            }}
                                            className="text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                        >
                                            <Icons.Camera size={12} /> Add
                                        </button>
                                    </div>
                                    
                                    {item.photos.length === 0 && (
                                        <div className="text-center py-4 bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-400 text-sm">
                                            No photos added
                                        </div>
                                    )}
                                    
                                    {item.photos.length > 0 && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {item.photos.map((photo, idx) => (
                                                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group border border-slate-200 dark:border-slate-700">
                                                    <img src={photo} className="w-full h-full object-cover" alt="Evidence" />
                                                    <button 
                                                        onClick={() => deletePhoto(activeSectionId, item.id, idx)}
                                                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Icons.Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        </div>
                    </SwipeableItem>
                );
                })}

                {/* Add Item Button */}
                <button 
                onClick={() => setShowAddItemModal(true)}
                className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold hover:border-chrp-teal hover:text-chrp-teal dark:hover:text-chrp-teal transition-colors flex items-center justify-center gap-2"
                >
                <Icons.Plus size={20} />
                Add Inspection Item
                </button>

                {/* Hidden Item Recovery */}
                {(inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => i.isHidden).length || 0) > 0 && (
                <div className="text-center pt-4">
                    <button 
                        onClick={() => {
                        // Unhide all logic
                        setInspection(prev => {
                            if (!prev) return null;
                            return {
                                ...prev,
                                sections: prev.sections.map(s => s.id !== activeSectionId ? s : {
                                    ...s,
                                    items: s.items.map(i => ({...i, isHidden: false}))
                                })
                            };
                        });
                        }}
                        className="text-xs text-slate-400 hover:text-chrp-teal underline"
                    >
                        Show {inspection.sections.find(s => s.id === activeSectionId)?.items.filter(i => i.isHidden).length} hidden items
                    </button>
                </div>
                )}

            </div>
            </div>

            {/* Modal for Adding Items */}
            {showAddItemModal && (
            <InputModal 
                title="Add Inspection Items"
                placeholder="e.g. Check GFCI outlets near the sink..."
                isLoading={isLoading}
                onCancel={() => setShowAddItemModal(false)}
                onConfirm={handleAddItem}
            />
            )}
        </div>
      )}
      
      </div>
  );
}
