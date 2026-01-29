import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { format, startOfDay, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Calendar, CheckCircle, XCircle } from "lucide-react";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Truck {
  id: string;
  unitNumber: string;
  name?: string;
  make: string;
  model: string;
  year: string;
  licensePlate: string;
  vinNumber?: string;
}

interface Inspection {
  id: string;
  truckId: string;
  driverId: string;
  inspectionDate: string;
  lightsWorking: boolean;
  brakesWorking: boolean;
  tiresCondition: boolean;
  mirrorsClear: boolean;
  hornWorking: boolean;
  windshieldClear: boolean;
  wipersWorking: boolean;
  oilLevelOk: boolean;
  coolantLevelOk: boolean;
  washerFluidOk: boolean;
  fireExtinguisherPresent: boolean;
  firstAidKitPresent: boolean;
  spillKitPresent: boolean;
  tdgDocumentsPresent: boolean;
  odometerReading: number;
  regularFuelLevel: string;
  premiumFuelLevel: string;
  dieselFuelLevel: string;
  truckFuelLevel?: string;
  fuelEconomy?: string;
  vehicleRoadworthy: boolean;
  notes?: string;
  defectsNoted?: string;
  createdAt: string;
  driver?: {
    id: string;
    name: string;
    email: string;
  };
}

interface CompanyInfo {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  ownerName: string;
  ownerEmail: string;
}

export default function PreTripDocument() {
  const [, params] = useRoute("/ops/pretrip-document/:truckId");
  const truckId = params?.truckId;
  const [selectedDate, setSelectedDate] = useState<string>(format(startOfDay(new Date()), "yyyy-MM-dd"));

  const { data: companyInfo } = useQuery<CompanyInfo>({
    queryKey: ["/api/company-info"],
    queryFn: async () => {
      const res = await fetch("/api/company-info");
      if (!res.ok) throw new Error("Failed to fetch company info");
      return res.json();
    },
  });

  const { data: truckData, isLoading: truckLoading } = useQuery<{ truck: Truck }>({
    queryKey: ["/api/ops/fleet/trucks", truckId],
    queryFn: async () => {
      const res = await fetch(`/api/ops/fleet/trucks/${truckId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch truck");
      return res.json();
    },
    enabled: !!truckId
  });

  const { data: inspectionsData, isLoading: inspectionsLoading } = useQuery<{ inspections: Inspection[] }>({
    queryKey: ["/api/ops/fleet/trucks", truckId, "pretrip"],
    queryFn: async () => {
      const res = await fetch(`/api/ops/fleet/trucks/${truckId}/pretrip?limit=90`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inspections");
      return res.json();
    },
    enabled: !!truckId
  });

  const truck = truckData?.truck;
  const inspections = inspectionsData?.inspections || [];
  
  const selectedInspection = inspections.find(insp => {
    const inspDate = format(new Date(insp.inspectionDate), "yyyy-MM-dd");
    return inspDate === selectedDate;
  });

  const availableDates = inspections.map(insp => ({
    date: format(new Date(insp.inspectionDate), "yyyy-MM-dd"),
    label: format(new Date(insp.inspectionDate), "MMM d, yyyy"),
    id: insp.id
  }));

  const handlePrint = () => {
    window.print();
  };

  if (truckLoading || inspectionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!truck) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Truck not found</p>
      </div>
    );
  }

  const CheckItem = ({ label, checked }: { label: string; checked: boolean }) => (
    <div className="flex items-center gap-2 py-1">
      {checked ? (
        <CheckCircle className="w-4 h-4 text-green-600 print:text-black" />
      ) : (
        <XCircle className="w-4 h-4 text-red-600 print:text-black" />
      )}
      <span className={!checked ? "font-bold" : ""}>{label}</span>
      <span className="ml-auto font-mono text-sm">{checked ? "PASS" : "FAIL"}</span>
    </div>
  );

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b">
        <Link href="/ops/fleet">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fleet
          </Button>
        </Link>
        
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select date" />
            </SelectTrigger>
            <SelectContent>
              {availableDates.length > 0 ? (
                availableDates.map(({ date, label }) => (
                  <SelectItem key={date} value={date}>{label}</SelectItem>
                ))
              ) : (
                <SelectItem value="" disabled>No inspections found</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handlePrint} disabled={!selectedInspection} data-testid="button-print-pretrip">
          <Printer className="w-4 h-4 mr-2" />
          Print Document
        </Button>
      </div>

      {!selectedInspection ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">No inspection found for {format(new Date(selectedDate), "MMMM d, yyyy")}</p>
            <p className="text-sm text-muted-foreground">Select a different date or complete a pre-trip inspection first.</p>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4">
          <div className="border-2 border-black p-6 print:p-4">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold uppercase tracking-wide">DAILY PRE-TRIP INSPECTION</h1>
              <h2 className="text-lg font-bold">{companyInfo?.companyName || "Prairie Mobile Fuel Services"}</h2>
              <p className="text-sm mt-1">TDG Compliance - Vehicle Safety Check</p>
            </div>

            <div className="border-2 border-black mb-6">
              <div className="grid grid-cols-2 border-b-2 border-black">
                <div className="p-3 border-r-2 border-black">
                  <p className="text-xs font-bold uppercase">Truck Unit:</p>
                  <p className="font-bold text-xl">{truck.unitNumber}</p>
                  <p className="text-sm">{truck.year} {truck.make} {truck.model}</p>
                  <p className="text-sm">License: {truck.licensePlate}</p>
                  {truck.vinNumber && <p className="text-xs text-gray-600">VIN: {truck.vinNumber}</p>}
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold uppercase">Inspection Date & Time:</p>
                  <p className="font-bold">{format(new Date(selectedInspection.inspectionDate), "MMMM d, yyyy")}</p>
                  <p className="text-sm">{format(new Date(selectedInspection.inspectionDate), "h:mm a")}</p>
                  <p className="text-xs mt-2 font-bold uppercase">Document Number:</p>
                  <p className="font-mono text-sm">PTI-{truck.unitNumber}-{format(new Date(selectedInspection.inspectionDate), "yyyyMMdd")}</p>
                </div>
              </div>

              <div className="p-3 border-b-2 border-black">
                <p className="text-xs font-bold uppercase">Operator / Driver:</p>
                {selectedInspection.driver ? (
                  <>
                    <p className="font-bold">{selectedInspection.driver.name}</p>
                    <p className="text-sm">{selectedInspection.driver.email}</p>
                  </>
                ) : (
                  <p className="italic text-gray-500">Driver information not available</p>
                )}
              </div>

              <div className="p-3">
                <p className="text-xs font-bold uppercase">Odometer Reading:</p>
                <p className="font-bold text-lg">{selectedInspection.odometerReading.toLocaleString()} km</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="border-2 border-black">
                <div className="bg-black text-white p-2 font-bold uppercase text-sm text-center">
                  Vehicle Condition
                </div>
                <div className="p-3 space-y-1">
                  <CheckItem label="Lights Working" checked={selectedInspection.lightsWorking} />
                  <CheckItem label="Brakes Working" checked={selectedInspection.brakesWorking} />
                  <CheckItem label="Tires Condition" checked={selectedInspection.tiresCondition} />
                  <CheckItem label="Mirrors Clear" checked={selectedInspection.mirrorsClear} />
                  <CheckItem label="Horn Working" checked={selectedInspection.hornWorking} />
                  <CheckItem label="Windshield Clear" checked={selectedInspection.windshieldClear} />
                  <CheckItem label="Wipers Working" checked={selectedInspection.wipersWorking} />
                </div>
              </div>

              <div className="border-2 border-black">
                <div className="bg-black text-white p-2 font-bold uppercase text-sm text-center">
                  Fluid Levels
                </div>
                <div className="p-3 space-y-1">
                  <CheckItem label="Oil Level OK" checked={selectedInspection.oilLevelOk} />
                  <CheckItem label="Coolant Level OK" checked={selectedInspection.coolantLevelOk} />
                  <CheckItem label="Washer Fluid OK" checked={selectedInspection.washerFluidOk} />
                </div>
              </div>
            </div>

            <div className="border-2 border-black mb-6">
              <div className="bg-black text-white p-2 font-bold uppercase text-sm text-center">
                Safety Equipment (TDG Required)
              </div>
              <div className="p-3 grid grid-cols-2 gap-x-4">
                <CheckItem label="Fire Extinguisher Present" checked={selectedInspection.fireExtinguisherPresent} />
                <CheckItem label="First Aid Kit Present" checked={selectedInspection.firstAidKitPresent} />
                <CheckItem label="Spill Kit Present" checked={selectedInspection.spillKitPresent} />
                <CheckItem label="TDG Documents Present" checked={selectedInspection.tdgDocumentsPresent} />
              </div>
            </div>

            <div className="border-2 border-black mb-6">
              <div className="bg-black text-white p-2 font-bold uppercase text-sm text-center">
                Fuel Inventory Levels (Start of Day)
              </div>
              <div className="p-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs font-bold uppercase">Regular (87)</p>
                    <p className="font-bold text-lg">{parseFloat(selectedInspection.regularFuelLevel).toFixed(1)} L</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase">Premium (91)</p>
                    <p className="font-bold text-lg">{parseFloat(selectedInspection.premiumFuelLevel).toFixed(1)} L</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase">Diesel</p>
                    <p className="font-bold text-lg">{parseFloat(selectedInspection.dieselFuelLevel).toFixed(1)} L</p>
                  </div>
                </div>
                {(selectedInspection.truckFuelLevel || selectedInspection.fuelEconomy) && (
                  <div className="mt-4 pt-3 border-t border-gray-300 grid grid-cols-2 gap-4 text-center">
                    {selectedInspection.truckFuelLevel && (
                      <div>
                        <p className="text-xs font-bold uppercase">Truck Fuel Tank</p>
                        <p className="font-bold">{parseFloat(selectedInspection.truckFuelLevel).toFixed(1)} L</p>
                      </div>
                    )}
                    {selectedInspection.fuelEconomy && (
                      <div>
                        <p className="text-xs font-bold uppercase">Fuel Economy</p>
                        <p className="font-bold">{parseFloat(selectedInspection.fuelEconomy).toFixed(1)} L/100km</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-2 border-black mb-6">
              <div className={`p-3 text-center ${selectedInspection.vehicleRoadworthy ? 'bg-green-100' : 'bg-red-100'} print:bg-white`}>
                <p className="text-xs font-bold uppercase">Vehicle Status</p>
                <p className={`font-bold text-xl ${selectedInspection.vehicleRoadworthy ? 'text-green-700' : 'text-red-700'} print:text-black`}>
                  {selectedInspection.vehicleRoadworthy ? '✓ ROADWORTHY - APPROVED FOR OPERATION' : '✗ NOT ROADWORTHY - DO NOT OPERATE'}
                </p>
              </div>
            </div>

            {(selectedInspection.notes || selectedInspection.defectsNoted) && (
              <div className="border-2 border-black mb-6">
                <div className="bg-black text-white p-2 font-bold uppercase text-sm text-center">
                  Notes & Defects
                </div>
                <div className="p-3">
                  {selectedInspection.defectsNoted && (
                    <div className="mb-3">
                      <p className="text-xs font-bold uppercase text-red-600 print:text-black">Defects Noted:</p>
                      <p className="whitespace-pre-wrap">{selectedInspection.defectsNoted}</p>
                    </div>
                  )}
                  {selectedInspection.notes && (
                    <div>
                      <p className="text-xs font-bold uppercase">Additional Notes:</p>
                      <p className="whitespace-pre-wrap">{selectedInspection.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-2 border-black">
              <div className="grid grid-cols-2">
                <div className="p-4 border-r-2 border-black">
                  <p className="text-xs font-bold uppercase mb-8">Operator Signature:</p>
                  <div className="border-b border-black mb-1"></div>
                  <p className="text-xs text-gray-500">{selectedInspection.driver?.name || 'Driver Name'}</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-bold uppercase mb-8">Date:</p>
                  <div className="border-b border-black mb-1"></div>
                  <p className="text-xs text-gray-500">{format(new Date(selectedInspection.inspectionDate), "MMMM d, yyyy")}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-gray-500">
              <p>This document is generated for TDG compliance purposes.</p>
              <p>{companyInfo?.companyName || "Prairie Mobile Fuel Services"} | {companyInfo?.companyAddress || "Calgary, Alberta"} | {companyInfo?.companyPhone || "403-430-0390"}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
