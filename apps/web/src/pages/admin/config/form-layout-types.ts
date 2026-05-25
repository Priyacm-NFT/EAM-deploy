export interface FormLayoutFieldPlacement {
  fieldKey: string;
}

export interface FormLayoutSection {
  id: string;
  title: string;
  columns: 1 | 2 | 3;
  fields: FormLayoutFieldPlacement[];
}

export interface FormLayoutDefinition {
  sections: FormLayoutSection[];
}

export function emptyFormLayout(): FormLayoutDefinition {
  return { sections: [] };
}
