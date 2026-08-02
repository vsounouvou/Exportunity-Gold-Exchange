export type TechnicalHierarchyInput = {
  machineId?: string | null;
  assemblyId?: string | null;
  componentId?: string | null;
};

export type TechnicalHierarchyAssembly = {
  id: string;
  machineId: string;
};

export type TechnicalHierarchyComponent = {
  id: string;
  machineId: string;
  assemblyId?: string | null;
};

export type TechnicalHierarchyResolution = {
  ok: true;
  machineId: string | null;
  assemblyId: string | null;
  componentId: string | null;
} | {
  ok: false;
  message: string;
};

function cleanId(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function resolveTechnicalHierarchy(
  input: TechnicalHierarchyInput,
  assets: {
    machineExists: boolean;
    assembly: TechnicalHierarchyAssembly | null;
    component: TechnicalHierarchyComponent | null;
  },
): TechnicalHierarchyResolution {
  const requestedMachineId = cleanId(input.machineId);
  const requestedAssemblyId = cleanId(input.assemblyId);
  const requestedComponentId = cleanId(input.componentId);

  if (requestedMachineId && !assets.machineExists) {
    return { ok: false, message: "The selected machine is not available for this factory." };
  }
  if (requestedAssemblyId && !assets.assembly) {
    return { ok: false, message: "The selected assembly is not available for this factory." };
  }
  if (requestedComponentId && !assets.component) {
    return { ok: false, message: "The selected component is not available for this factory." };
  }

  const machineId = requestedMachineId || assets.assembly?.machineId || assets.component?.machineId || null;
  const assemblyId = requestedAssemblyId || assets.component?.assemblyId || null;

  if (assets.assembly && machineId && assets.assembly.machineId !== machineId) {
    return { ok: false, message: "The selected assembly does not belong to the selected machine." };
  }
  if (assets.component && machineId && assets.component.machineId !== machineId) {
    return { ok: false, message: "The selected component does not belong to the selected machine." };
  }
  if (assets.component && assemblyId && assets.component.assemblyId !== assemblyId) {
    return { ok: false, message: "The selected component does not belong to the selected assembly." };
  }

  return {
    ok: true,
    machineId,
    assemblyId,
    componentId: requestedComponentId,
  };
}
