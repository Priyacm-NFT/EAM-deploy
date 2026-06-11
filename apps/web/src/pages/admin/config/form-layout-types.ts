export interface FormLayoutFieldPlacement {
  fieldKey: string;
}

export interface FormLayoutSection {
  id: string;
  title: string;
  columns: 1 | 2 | 3;
  fields: FormLayoutFieldPlacement[];
  collapsible?: boolean;
  collapsedByDefault?: boolean;
  tabName?: string; // if set, section belongs to this tab
}

export interface FormLayoutDefinition {
  sections: FormLayoutSection[];
  tabs?: string[]; // optional tab names
}

export function emptyFormLayout(): FormLayoutDefinition {
  return { sections: [] };
}
