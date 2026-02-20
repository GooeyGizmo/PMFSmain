import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, ArrowLeft, Calendar } from "lucide-react";
import { Link } from "wouter";
import { COMPANY_EMAILS } from '@shared/schema';

interface Truck {
  id: string;
  unitNumber: string;
  name?: string;
  make: string;
  model: string;
  year: string;
  licensePlate: string;
  vinNumber?: string;
  regularCapacity: string;
  premiumCapacity: string;
  dieselCapacity: string;
  regularLevel: string;
  premiumLevel: string;
  dieselLevel: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverEmail?: string;
}

interface Transaction {
  id: string;
  truckId: string;
  transactionType: string;
  fuelType: string;
  litres: string;
  previousLevel: string;
  newLevel: string;
  unNumber: string;
  properShippingName: string;
  dangerClass: string;
  packingGroup: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  orderId?: string;
  operatorId: string;
  operatorName: string;
  notes?: string;
  createdAt: string;
}

const FUEL_INFO = {
  regular: {
    unNumber: "UN1203",
    properShippingName: "GASOLINE",
    displayName: "87 Regular Gasoline",
    dangerClass: "3",
    packingGroup: "II",
    placard: "FLAMMABLE LIQUID"
  },
  premium: {
    unNumber: "UN1203",
    properShippingName: "GASOLINE",
    displayName: "91 Premium Gasoline",
    dangerClass: "3",
    packingGroup: "II",
    placard: "FLAMMABLE LIQUID"
  },
  diesel: {
    unNumber: "UN1202",
    properShippingName: "DIESEL FUEL",
    displayName: "Diesel",
    dangerClass: "3",
    packingGroup: "III",
    placard: "FLAMMABLE LIQUID"
  }
};

interface CompanyInfo {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  ownerName: string;
  ownerEmail: string;
}

export default function FuelLog() {
  const [, params] = useRoute("/owner/operations/fuel-log/:truckId");
  const truckId = params?.truckId;
  const searchParams = new URLSearchParams(window.location.search);
  const fuelTypeFilter = searchParams.get('fuelType');
  const dateFromUrl = searchParams.get('date');
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (dateFromUrl) return dateFromUrl;
    return format(new Date(), 'yyyy-MM-dd');
  });

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

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery<{ transactions: Transaction[] }>({
    queryKey: ["/api/ops/fleet/trucks", truckId, "transactions", fuelTypeFilter, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fuelTypeFilter) params.set('fuelType', fuelTypeFilter);
      if (selectedDate) {
        params.set('startDate', `${selectedDate}T00:00:00.000Z`);
        params.set('endDate', `${selectedDate}T23:59:59.999Z`);
      }
      const url = `/api/ops/fleet/trucks/${truckId}/transactions${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!truckId
  });
  
  const truck = truckData?.truck;
  const transactions = transactionsData?.transactions || [];

  const handlePrint = () => {
    window.print();
  };

  if (truckLoading || transactionsLoading) {
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

  const regularLevel = parseFloat(truck.regularLevel) || 0;
  const premiumLevel = parseFloat(truck.premiumLevel) || 0;
  const dieselLevel = parseFloat(truck.dieselLevel) || 0;
  const regularCapacity = parseFloat(truck.regularCapacity) || 0;
  const premiumCapacity = parseFloat(truck.premiumCapacity) || 0;
  const dieselCapacity = parseFloat(truck.dieselCapacity) || 0;

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b flex-wrap">
        <Link href="/owner/operations?tab=fleet">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fleet
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
            data-testid="input-fuel-log-date"
          />
        </div>
        <Button onClick={handlePrint} data-testid="button-print-fuel-log">
          <Printer className="w-4 h-4 mr-2" />
          Print Document
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4">
        <div className="border-2 border-prairie-600 p-6 print:p-4">
          
          <div className="flex justify-between items-start mb-6 border-b-2 border-prairie-600 pb-4">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-16 h-16 bg-prairie-600 text-white flex items-center justify-center font-bold text-xs text-center rounded">
                  PMFS
                </div>
                <div>
                  <h1 className="text-xl font-bold">{companyInfo?.companyName || "Prairie Mobile Fuel Services"}</h1>
                  <p className="text-sm">Mobile Fuel Delivery • {companyInfo?.companyAddress || "Calgary, Alberta"}</p>
                </div>
              </div>
              <div className="text-sm mt-2">
                <p><strong>Email:</strong> {companyInfo?.companyEmail || COMPANY_EMAILS.INFO}</p>
                <p><strong>Phone:</strong> {companyInfo?.companyPhone || "(403) 430-0390"}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold uppercase">Fuel Transaction Log</h2>
              <p className="text-sm">Unit #{truck.unitNumber}</p>
              <p className="text-sm font-medium">{format(new Date(selectedDate + 'T12:00:00'), "MMMM d, yyyy")}</p>
              <p className="text-xs text-gray-600">Generated: {format(new Date(), "MMM d, yyyy 'at' h:mm a")}</p>
            </div>
          </div>

          <div className="border-2 border-red-600 bg-red-50 p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-red-600 text-white flex items-center justify-center font-bold text-xl rounded">
                3
              </div>
              <div>
                <p className="font-bold text-red-700 uppercase">Flammable Liquid - Class 3</p>
                <p className="text-sm">Keep away from heat, sparks, open flames, hot surfaces. No smoking.</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-prairie-600 p-4 mb-6 bg-wheat-50">
            <p className="font-bold uppercase text-center mb-3 text-prairie-700">EMERGENCY CONTACTS</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <p className="font-bold text-red-600">Emergency Services</p>
                <p className="text-2xl font-bold">911</p>
              </div>
              <div className="text-center border-l border-r border-prairie-600 px-4">
                <p className="font-bold text-red-600">CANUTEC (24/7)</p>
                <p className="text-lg font-bold">1-888-226-8832</p>
                <p className="text-xs">or *666 (cell)</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-red-600">Company Contact</p>
                <p className="font-bold">{companyInfo?.ownerName || "Owner/Operator"}</p>
                <p className="text-sm">{companyInfo?.companyPhone || "403-430-0390"}</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-prairie-600 mb-6">
            <div className="bg-prairie-600 text-white p-2 font-bold uppercase text-center">
              Vehicle & Tank Information - Unit #{truck.unitNumber}
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs font-bold uppercase text-gray-600">Vehicle</p>
                  <p>{truck.year} {truck.make} {truck.model}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-gray-600">License Plate</p>
                  <p>{truck.licensePlate}</p>
                </div>
                {truck.vinNumber && (
                  <div className="col-span-2">
                    <p className="text-xs font-bold uppercase text-gray-600">VIN</p>
                    <p className="font-mono text-sm">{truck.vinNumber}</p>
                  </div>
                )}
              </div>
              
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-prairie-600 bg-prairie-50">
                    <th className="p-2 text-left text-sm">Fuel Type</th>
                    <th className="p-2 text-left text-sm">UN #</th>
                    <th className="p-2 text-center text-sm">Class</th>
                    <th className="p-2 text-center text-sm">PG</th>
                    <th className="p-2 text-right text-sm">Tank Capacity</th>
                    <th className="p-2 text-right text-sm">Current Level</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 font-bold">{FUEL_INFO.regular.displayName}</td>
                    <td className="p-2 font-mono">{FUEL_INFO.regular.unNumber}</td>
                    <td className="p-2 text-center">{FUEL_INFO.regular.dangerClass}</td>
                    <td className="p-2 text-center">{FUEL_INFO.regular.packingGroup}</td>
                    <td className="p-2 text-right">{regularCapacity.toFixed(0)} L</td>
                    <td className="p-2 text-right font-bold">{regularLevel.toFixed(1)} L</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="p-2 font-bold">{FUEL_INFO.premium.displayName}</td>
                    <td className="p-2 font-mono">{FUEL_INFO.premium.unNumber}</td>
                    <td className="p-2 text-center">{FUEL_INFO.premium.dangerClass}</td>
                    <td className="p-2 text-center">{FUEL_INFO.premium.packingGroup}</td>
                    <td className="p-2 text-right">{premiumCapacity.toFixed(0)} L</td>
                    <td className="p-2 text-right font-bold">{premiumLevel.toFixed(1)} L</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold">{FUEL_INFO.diesel.displayName}</td>
                    <td className="p-2 font-mono">{FUEL_INFO.diesel.unNumber}</td>
                    <td className="p-2 text-center">{FUEL_INFO.diesel.dangerClass}</td>
                    <td className="p-2 text-center">{FUEL_INFO.diesel.packingGroup}</td>
                    <td className="p-2 text-right">{dieselCapacity.toFixed(0)} L</td>
                    <td className="p-2 text-right font-bold">{dieselLevel.toFixed(1)} L</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-2 border-prairie-600 mb-6">
            <div className="bg-prairie-600 text-white p-2 font-bold uppercase text-center">
              Transaction Log {fuelTypeFilter ? `(${fuelTypeFilter.charAt(0).toUpperCase() + fuelTypeFilter.slice(1)} Only)` : '(All Fuel Types)'}
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-prairie-600 bg-prairie-50">
                  <th className="p-2 text-left">Date/Time</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-right">Quantity</th>
                  <th className="p-2 text-center">Level Change</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Operator</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-gray-500 italic">
                      No transactions recorded
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const fuelInfo = FUEL_INFO[tx.fuelType as keyof typeof FUEL_INFO];
                    const litres = parseFloat(tx.litres);
                    return (
                      <tr key={tx.id} className="border-b border-gray-200">
                        <td className="p-2 font-mono text-xs">
                          {format(new Date(tx.createdAt), "MMM d, yyyy")}<br/>
                          <span className="text-gray-500">{format(new Date(tx.createdAt), "h:mm a")}</span>
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            tx.transactionType === 'fill' ? 'bg-green-100 text-green-800' : 
                            tx.transactionType === 'ops_empty' ? 'bg-red-100 text-red-800' : 
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {tx.transactionType === 'fill' ? 'FILL' : tx.transactionType === 'ops_empty' ? 'OPS EMPTY' : 'DISPENSE'}
                          </span>
                          {tx.orderId && (
                            <span className="ml-2 text-xs bg-prairie-100 text-prairie-700 px-2 py-0.5 rounded font-mono">
                              #{tx.orderId.slice(0, 8).toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <span className="font-bold">{fuelInfo?.displayName || tx.fuelType}</span><br/>
                          <span className="text-xs text-gray-500">{tx.unNumber} • Class {tx.dangerClass}</span>
                        </td>
                        <td className={`p-2 text-right font-bold ${
                          tx.transactionType === 'fill' ? 'text-green-600' : 
                          tx.transactionType === 'ops_empty' ? 'text-red-600' : 
                          'text-blue-600'
                        }`}>
                          {tx.transactionType === 'fill' ? '+' : '-'}{Math.abs(litres).toFixed(1)}L
                        </td>
                        <td className="p-2 text-center text-xs">
                          {parseFloat(tx.previousLevel).toFixed(0)}L → {parseFloat(tx.newLevel).toFixed(0)}L
                        </td>
                        <td className="p-2 text-xs">
                          {tx.deliveryAddress || '-'}
                        </td>
                        <td className="p-2 text-xs">
                          {tx.operatorName}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-center text-xs text-prairie-600 mt-6 pt-4 border-t border-prairie-300">
            <p className="font-bold">Prairie Mobile Fuel Services</p>
            <p>TDG-Compliant Fuel Transaction Log</p>
            <p>Generated: {format(new Date(), "yyyy-MM-dd HH:mm:ss")}</p>
            <p className="mt-2">This document must be retained for regulatory compliance purposes.</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .max-w-4xl, .max-w-4xl * {
            visibility: visible;
          }
          .max-w-4xl {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </>
  );
}
