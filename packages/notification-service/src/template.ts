import Handlebars from 'handlebars';

Handlebars.registerHelper('formatDate', (value: string) => new Date(value).toISOString());

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return Handlebars.compile(template)(data);
}
