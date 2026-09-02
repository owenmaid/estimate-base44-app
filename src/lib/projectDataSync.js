import { base44 } from '@/api/base44Client';

/**
 * Fetch equipment calculations from ProjectDetailsSetup by project number and SKU
 * @param {string} projectNumber - The project number to match
 * @param {string} sku - The inventory SKU to match
 * @returns {Promise<{regCost, otCost, specialCost, total} | null>}
 */
export const fetchEquipmentTotal = async (projectNumber, sku) => {
  try {
    if (!projectNumber || !sku) return null;

    const [matchingProject] = await base44.entities.Project.filter(
      { project_number: projectNumber },
      null,
      1
    );

    if (!matchingProject) return null;

    const [matchingItem] = await base44.entities.InventoryItem.filter(
      { sku },
      null,
      1
    );

    if (!matchingItem) return null;

    // Calculate totals based on equipmentRows and costs
    // This mirrors the logic from ProjectDetailsSetup
    const equipmentRows = matchingProject.equipment_rows || [];
    const matchingRow = equipmentRows.find(
      r => r.item_id === matchingItem.id
    );

    if (!matchingRow) return null;

    // For now, return placeholder structure
    // The actual totals would be calculated in ProjectDetailsSetup
    return {
      regCost: 0,
      otCost: 0,
      specialCost: 0,
      total: 0,
      found: true,
    };
  } catch (error) {
    console.error('Error fetching equipment total:', error);
    return null;
  }
};

/**
 * Validate that project number exists
 */
export const validateProjectNumber = async (projectNumber) => {
  try {
    if (!projectNumber) return false;
    const matches = await base44.entities.Project.filter(
      { project_number: projectNumber },
      null,
      1
    );
    return matches.length > 0;
  } catch (error) {
    console.error('Error validating project number:', error);
    return false;
  }
};