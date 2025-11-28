
import React from 'react';
import { 
  Home, 
  Utensils, 
  Bath, 
  BedDouble, 
  Wind, 
  Zap, 
  Droplet, 
  Sun, 
  Box, 
  Wrench,
  CheckCircle,
  Circle,
  Camera,
  ChevronLeft,
  Loader2,
  FileText,
  AlertTriangle,
  Info,
  ShieldCheck,
  Skull,
  XCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  Printer,
  Share2,
  EyeOff,
  Eye,
  Save,
  CloudUpload,
  BookOpen,
  ScrollText,
  Moon,
  MapPin
} from 'lucide-react';

export const IconMap: Record<string, React.FC<{ className?: string }>> = {
  home: Home,
  kitchen: Utensils,
  bath: Bath,
  bed: BedDouble,
  wind: Wind,
  zap: Zap,
  droplet: Droplet,
  sun: Sun,
  box: Box,
  tool: Wrench
};

export const Icons = {
  CheckCircle,
  Circle,
  Camera,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  AlertTriangle,
  Info,
  ShieldCheck,
  Skull,
  XCircle,
  Plus,
  Trash2,
  Search,
  Printer,
  Share2,
  EyeOff,
  Eye,
  Save,
  CloudUpload,
  BookOpen,
  ScrollText,
  Moon,
  Sun,
  MapPin
};

export const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
  const IconComponent = IconMap[name] || Box;
  return <IconComponent className={className} />;
};
