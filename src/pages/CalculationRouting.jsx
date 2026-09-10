import React from 'react';
import EquipmentCalculator from '@/components/calculation/EquipmentCalculator';

export default function CalculationRouting() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manpower and Equipment Estimation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure project parameters and auto-compute total costs from inventory data.
        </p>
      </div>
      <EquipmentCalculator />
    </div>
  );
}