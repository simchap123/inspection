
export type ItemStatus = 'untouched' | 'pass' | 'info' | 'attention' | 'moderate' | 'dangerous';

export interface InspectionChecklistItem {
  id: string;
  label: string;
  status: ItemStatus; // Replaces 'checked'
  notes: string;
  photos: string[];
  options?: string[]; // AI generated choices (e.g. ["Poured Concrete", "Block"])
  selectedOption?: string; // User selection
  isHidden?: boolean; // New property for hiding items
}

export interface InspectionSection {
  id: string;
  title: string;
  iconName: string; // e.g., 'home', 'kitchen', 'bath'
  description: string;
  items: InspectionChecklistItem[];
  photoUrl?: string; // Main section photo (cover)
  status: 'pending' | 'in-progress' | 'completed';
}

export interface InspectionProfile {
  id: string;
  savedReportId?: string; // Supabase UUID
  shortId?: string; // For shorter shareable URLs
  userId?: string; // Owner of the report
  address: string;
  googleMapsUrl?: string; // Official Google Maps Link from Grounding
  propertyType: string; // e.g., "Ranch", "Colonial"
  floors: number;
  baths: number;
  bedrooms: number;
  sqft?: number;
  yearBuilt?: string;
  
  occupancy?: string;
  pets?: string;

  // Environmental
  weather?: string;
  temperatureOutside?: string;
  temperatureInside?: string;
  
  // Utilities
  gasType?: string;
  sewerType?: string;
  waterType?: string;
  electricPanel?: string;
  generatorType?: string;

  inspectorName: string;
  createdAt: string;
  sections: InspectionSection[];
}

export enum AppView {
  LANDING = 'LANDING',
  SETUP = 'SETUP',
  LOADING = 'LOADING',
  DASHBOARD = 'DASHBOARD',
  SECTION_DETAIL = 'SECTION_DETAIL',
  CAMERA = 'CAMERA',
  REPORT = 'REPORT',
  AUTH = 'AUTH'
}
