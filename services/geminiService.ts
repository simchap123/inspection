
import { GoogleGenAI, Type } from "@google/genai";
import { InspectionSection, InspectionProfile, InspectionChecklistItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Robust helper to extract JSON from potentially Markdown-wrapped or chatty responses
const parseSearchResponse = (text: string | undefined): any => {
  if (!text) return {};
  try {
    // 1. Try direct parse (cleanest)
    return JSON.parse(text);
  } catch {
    // 2. Try to find markdown JSON block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch {}
    }
    // 3. Try to find first { and last } (fallback for chatty responses)
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
       try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch {}
    }
    return {};
  }
};

const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  // Remove markdown code blocks
  let cleaned = text.replace(/```json|```/g, '').trim();
  // Sometimes the model outputs text before the JSON array/object
  const firstCurly = cleaned.indexOf('{');
  const firstSquare = cleaned.indexOf('[');
  
  // Determine which starts first
  let startIndex = -1;
  if (firstCurly !== -1 && firstSquare !== -1) {
    startIndex = Math.min(firstCurly, firstSquare);
  } else if (firstCurly !== -1) {
    startIndex = firstCurly;
  } else {
    startIndex = firstSquare;
  }

  if (startIndex !== -1) {
      cleaned = cleaned.substring(startIndex);
  }
  
  // Find the last closing bracket
  const lastCurly = cleaned.lastIndexOf('}');
  const lastSquare = cleaned.lastIndexOf(']');
  let endIndex = Math.max(lastCurly, lastSquare);
  
  if (endIndex !== -1) {
      cleaned = cleaned.substring(0, endIndex + 1);
  }

  return cleaned;
};

/**
 * Uses Google Search Grounding to find property details based on the address.
 */
export const detectPropertyDetails = async (address: string): Promise<Partial<InspectionProfile> & { formattedAddress?: string, currentTemp?: string, currentWeather?: string, googleMapsUrl?: string }> => {
  const model = "gemini-2.5-flash"; 

  const prompt = `
    Find real estate details for the property at: ${address}.
    Also find the current weather conditions for this location.

    I need the following information:
    1. Correct Full Address (formatted).
    2. Property Style (e.g., Ranch, Colonial, High Ranch, Bi-Level, Cape Cod).
    3. Number of Floors/Stories.
    4. Number of Bedrooms.
    5. Number of Bathrooms.
    6. Year Built.
    7. Approximate Square Footage.
    8. Heating Fuel / Gas Type (Natural Gas, Propane, Oil, Electric).
    9. Sewer Type (Public Sewer, Septic System).
    10. Water Source (Public Water, Well).
    11. Current Temperature (in Fahrenheit).
    12. Current Weather Condition (e.g., Sunny, Cloudy, Rain).
    
    If you find conflicting info, pick the most likely or most recent.

    CRITICAL: Output strictly valid JSON. Do not include markdown formatting or conversational text if possible.
    Target JSON Format:
    {
      "formattedAddress": "string",
      "propertyType": "string",
      "floors": number,
      "bedrooms": number,
      "baths": number,
      "yearBuilt": "string",
      "sqft": number,
      "gasType": "string",
      "sewerType": "string",
      "waterType": "string",
      "currentTemp": "string",
      "currentWeather": "string"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        // Use both Search (for facts/weather) and Maps (for precise location/link)
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
      }
    });

    // Parse the natural language response to find the JSON object
    const result = parseSearchResponse(response.text);

    // Extract Google Maps URL from grounding chunks if available
    let googleMapsUrl = undefined;
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      const chunks = response.candidates[0].groundingMetadata.groundingChunks;
      // Look for a map chunk
      const mapChunk = chunks.find(c => c.maps?.uri);
      if (mapChunk && mapChunk.maps) {
        googleMapsUrl = mapChunk.maps.uri;
      }
    }

    return { ...result, googleMapsUrl };
  } catch (error) {
    console.error("Error detecting property details:", error);
    return {};
  }
};

/**
 * Generates a specific inspection plan based on detailed property info and InterNACHI standards.
 */
export const generateInspectionPlan = async (
  address: string,
  propertyType: string,
  floors: number,
  baths: number,
  bedrooms: number
): Promise<InspectionSection[]> => {
  
  const model = "gemini-2.5-flash";
  
  const prompt = `
    I am a home inspector inspecting a ${propertyType} style house at ${address}.
    Details: ${floors} floors, ${baths} bathrooms, ${bedrooms} bedrooms.
    
    Generate a JSON inspection checklist that strictly adheres to the InterNACHI Standards of Practice.
    
    MANDATORY SECTIONS AND ITEMS (Do not omit these):
    
    1. ROOF
       - Roof-covering materials (Options: Asphalt Shingle, Wood Shingle/Shake, Tile, Metal, Slate, Rolled)
       - Gutters & Downspouts
       - Vents, flashing, skylights, chimney & other penetrations
       - General structure of roof
    
    2. EXTERIOR
       - Exterior wall-covering/Siding (Options: Vinyl, Stucco, Brick Veneer, Wood Siding, Aluminum, Fiber Cement, EIFS)
       - Exterior doors, decks, balconies, porches, & steps
       - Eaves, soffits, and fascia
       - Vegetation, grading, surface drainage, & retaining walls
       - Walkways & driveways
    
    3. BASEMENT, FOUNDATION, CRAWLSPACE
       - Foundation Type (Options: Poured Concrete, Concrete Block, Slab-on-Grade, Stone Masonry, Wood Post & Pier)
       - Basement floor & walls (check for moisture)
       - Crawlspace (if applicable)
       - Structural components
       - Floor Structure (Options: 2x10 Joists, I-Joists, Truss, Slab)
    
    4. HEATING
       - Heating System Operation
       - Energy Source (Options: Natural Gas, Propane, Oil, Electric, Geothermal, Solid Wood)
       - Heating Method (Options: Forced Air, Hydronic/Baseboard, Steam, Heat Pump, Electric Baseboard)
       - Thermostat location & operation
       - Vent systems, flues, and chimneys
    
    5. COOLING
       - Cooling System Operation
       - Cooling Method (Options: Central Air, Split/Ductless, Window Unit, Evaporative Cooler)
    
    6. PLUMBING
       - Main water supply shut-off valve
       - Main fuel supply shut-off valve
       - Water heating equipment (TPR valve, venting, seismic bracing)
       - Interior water supply (pressure/flow)
       - Toilets (flush test, secure to floor)
       - Sinks, tubs, & showers (drains & leaks)
       - Drain, waste, and vent systems
       - Sump pumps with accessible floats
       - Water Supply Type (Options: Public, Private Well)
    
    7. ELECTRICAL
       - Service drop, overhead conductors, & attachment point
       - Service head, gooseneck, & drip loops
       - Electric meter & base
       - Service-entrance conductors
       - Main service disconnect
       - Panelboards & over-current devices (breakers/fuses)
       - Service grounding & bonding
       - Wiring Methods (Options: Romex/NM, BX/AC (Armored), Knob-and-Tube, Aluminum Branch, Conduit)
       - GFCIs (Kitchen, Bath, Exterior, Garage)
       - AFCIs (Bedrooms/Living areas if applicable)
       - Smoke & Carbon Monoxide detectors
    
    8. FIREPLACE (If applicable)
       - Fireplace & chimney structure
       - Damper door operation
       - Hearth & extension
       - Cleanout doors
    
    9. ATTIC, INSULATION & VENTILATION
       - Insulation in unfinished spaces
       - Insulation Type (Options: Fiberglass Batts, Blown-in Fiberglass, Cellulose, Spray Foam, Rock Wool)
       - Ventilation of attic/crawlspace
       - Mechanical exhaust systems (Kitchen/Bath/Laundry)
    
    10. DOORS, WINDOWS & INTERIOR
        - Doors & Windows (representative number)
        - Floors, walls, & ceilings
        - Stairs, steps, landings, & railings
        - Garage vehicle doors & openers (safety reverse sensors)
    
    11. APPLIANCES
        - Dishwasher
        - Range/Oven/Cooktop
        - Food Waste Disposer
        - Microwave
        - Trash Compactor (if present)
        - Doorbell
    
    DYNAMIC ADDITIONS:
    - Generate specific sections for specific bathrooms (e.g. Master Bath, Hall Bath) if count > 1.
    - Generate specific sections for Bedrooms (e.g. Master Bed, Bed 2) if count > 1.
    
    OUTPUT FORMAT:
    JSON Array of objects.
    Icon names must be from: ['home', 'kitchen', 'bath', 'bed', 'wind', 'zap', 'droplet', 'sun', 'box', 'tool'].
    
    Example:
    [
      {
        "title": "Roof",
        "description": "Covering, flashings, and drainage",
        "iconName": "sun",
        "items": [
          { "label": "Roof-Covering Material", "options": ["Asphalt", "Metal"] },
          { "label": "Gutters & Downspouts" }
        ]
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const rawData = JSON.parse(cleanJson(response.text));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections: InspectionSection[] = rawData.map((section: any, index: number) => ({
      id: `section-${index}-${Date.now()}`,
      title: section.title,
      description: section.description,
      iconName: section.iconName,
      status: 'pending',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: section.items.map((item: any, i: number) => ({
        id: `item-${index}-${i}`,
        label: item.label,
        status: 'untouched',
        notes: '',
        photos: [],
        options: item.options || undefined,
        selectedOption: undefined
      }))
    }));

    return sections;

  } catch (error) {
    console.error("Error generating inspection plan:", error);
    // Fallback based on InterNACHI standards if AI fails
    return [
      {
        id: 'fb-1', title: 'Roof', description: 'InterNACHI Standard', iconName: 'sun', status: 'pending', items: [
          { id: 'r1', label: 'Roof-Covering Materials', status: 'untouched', notes: '', photos: [], options: ['Asphalt Shingle', 'Wood Shake', 'Tile', 'Metal', 'Slate'] },
          { id: 'r2', label: 'Gutters & Downspouts', status: 'untouched', notes: '', photos: [] },
          { id: 'r3', label: 'Vents, Flashing, Skylights & Chimney', status: 'untouched', notes: '', photos: [] }
        ]
      },
      {
        id: 'fb-2', title: 'Exterior', description: 'InterNACHI Standard', iconName: 'home', status: 'pending', items: [
           { id: 'e1', label: 'Wall-Covering / Siding', status: 'untouched', notes: '', photos: [], options: ['Vinyl', 'Stucco', 'Brick Veneer', 'Fiber Cement', 'Wood'] },
           { id: 'e2', label: 'Grading & Surface Drainage', status: 'untouched', notes: '', photos: [] },
           { id: 'e3', label: 'Walkways & Driveways', status: 'untouched', notes: '', photos: [] }
        ]
      },
      {
        id: 'fb-3', title: 'Foundation', description: 'InterNACHI Standard', iconName: 'box', status: 'pending', items: [
           { id: 'f1', label: 'Foundation Type', status: 'untouched', notes: '', photos: [], options: ['Poured Concrete', 'Block', 'Slab', 'Stone'] },
           { id: 'f2', label: 'Structural Components', status: 'untouched', notes: '', photos: [] }
        ]
      },
      {
         id: 'fb-4', title: 'Heating', description: 'InterNACHI Standard', iconName: 'wind', status: 'pending', items: [
            { id: 'h1', label: 'Heating Method', status: 'untouched', notes: '', photos: [], options: ['Forced Air', 'Hydronic', 'Heat Pump', 'Electric'] },
            { id: 'h2', label: 'Energy Source', status: 'untouched', notes: '', photos: [], options: ['Gas', 'Oil', 'Electric', 'Propane'] }
         ]
      },
      {
         id: 'fb-5', title: 'Electrical', description: 'InterNACHI Standard', iconName: 'zap', status: 'pending', items: [
            { id: 'el1', label: 'Service Drop & Conductors', status: 'untouched', notes: '', photos: [] },
            { id: 'el2', label: 'Main Service Disconnect', status: 'untouched', notes: '', photos: [] },
            { id: 'el3', label: 'Wiring Methods', status: 'untouched', notes: '', photos: [], options: ['Romex/NM', 'BX/Armored', 'Knob-and-Tube', 'Conduit'] }
         ]
      },
      {
         id: 'fb-6', title: 'Plumbing', description: 'InterNACHI Standard', iconName: 'droplet', status: 'pending', items: [
            { id: 'p1', label: 'Main Water Shut-off', status: 'untouched', notes: '', photos: [] },
            { id: 'p2', label: 'Water Heater', status: 'untouched', notes: '', photos: [] }
         ]
      }
    ];
  }
};

/**
 * Generates a single new section based on a user prompt.
 */
export const generateSingleSection = async (userPrompt: string): Promise<InspectionSection | null> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    Create a single home inspection section for: "${userPrompt}".
    
    Include 5-8 standard inspection items for this area.
    If items typically need identification (like material type), include an 'options' array.
    Choose a valid icon name from: ['home', 'kitchen', 'bath', 'bed', 'wind', 'zap', 'droplet', 'sun', 'box', 'tool'].

    Output JSON object only (not array).
    Format:
    {
      "title": "String",
      "description": "String",
      "iconName": "String",
      "items": [ { "label": "String", "options": ["opt1", "opt2"] } ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const data = JSON.parse(cleanJson(response.text));
    
    return {
      id: `section-custom-${Date.now()}`,
      title: data.title,
      description: data.description,
      iconName: data.iconName,
      status: 'pending',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: data.items.map((item: any, i: number) => ({
        id: `item-custom-${Date.now()}-${i}`,
        label: item.label,
        status: 'untouched',
        notes: '',
        photos: [],
        options: item.options || undefined
      }))
    };
  } catch (error) {
    console.error("Error generating single section:", error);
    return null;
  }
};

/**
 * Generates specific items to add to a section based on user prompt.
 */
export const generateSectionItems = async (sectionTitle: string, userPrompt: string): Promise<InspectionChecklistItem[]> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    For a home inspection section titled "${sectionTitle}", generate a list of inspection items based on this request: "${userPrompt}".
    
    Output JSON array of objects.
    Format:
    [
      { "label": "Item Name", "options": ["opt1", "opt2"] } 
    ]
    (Options are optional, include only if relevant for materials/types).
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const data = JSON.parse(cleanJson(response.text));
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((item: any, i: number) => ({
        id: `item-added-${Date.now()}-${i}`,
        label: item.label,
        status: 'untouched',
        notes: '',
        photos: [],
        options: item.options || undefined
    }));
  } catch (error) {
    console.error("Error generating items:", error);
    return [];
  }
};

/**
 * Analyzes an inspection photo to provide a short description based on status.
 */
export const analyzeInspectionImage = async (
  base64Image: string,
  itemLabel: string,
  currentStatus: string
): Promise<string> => {
  const model = "gemini-2.5-flash";

  let specificInstruction = "";
  if (['dangerous', 'moderate', 'attention'].includes(currentStatus)) {
    specificInstruction = "Focus on the specific defect, hazard, or damage visible. Be concise and technical.";
  } else {
    specificInstruction = "Simply identify the material, type, or confirm it appears in good condition.";
  }

  const prompt = `
    You are a home inspector assistant. 
    Item being inspected: "${itemLabel}".
    User marked status as: "${currentStatus}".
    
    Analyze the image. ${specificInstruction}
    
    Output requirement:
    - 1 extremely short sentence (under 15 words).
    - No filler words like "The image shows".
    - Example for defect: "Horizontal crack visible in mid-span of foundation block."
    - Example for good: "200 Amp service panel with clear labeling."
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } },
          { text: prompt }
        ]
      }
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Error analyzing image:", error);
    return "Analyzed image.";
  }
};
