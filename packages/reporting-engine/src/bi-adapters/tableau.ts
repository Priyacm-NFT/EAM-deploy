import type { ReportSubjectField } from '../types.js';

export interface TableauColumnSchema {
  id: string;
  dataType: string;
}

export function mapFieldTypeToTableau(type: string): string {
  switch (type) {
    case 'number':
      return 'int';
    case 'date':
    case 'datetime':
      return 'date';
    case 'boolean':
      return 'bool';
    default:
      return 'string';
  }
}

export function buildTableauSchema(fields: ReportSubjectField[]): { columns: TableauColumnSchema[] } {
  return {
    columns: fields.map((f) => ({
      id: f.key,
      dataType: mapFieldTypeToTableau(f.type),
    })),
  };
}

export function paginateTableauData<T>(
  rows: T[],
  page = 1,
  pageSize = 100,
): { page: number; pageSize: number; total: number; data: T[] } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(1000, Math.max(1, pageSize));
  const start = (safePage - 1) * safeSize;
  return {
    page: safePage,
    pageSize: safeSize,
    total: rows.length,
    data: rows.slice(start, start + safeSize),
  };
}

export function tableauWdcHtml(apiBase: string, subjectId: string): string {
  return `<!DOCTYPE html>
<html><head><title>EAM Tableau WDC</title>
<script src="https://connectors.tableau.com/libs/tableauwdc-2.3.latest.js"></script>
</head><body>
<script>
var cols = [];
fetch('${apiBase}/reporting/tableau-wdc/${subjectId}/schema').then(r=>r.json()).then(s=>{
  cols = s.columns.map(c=>({id:c.id,dataType:c.dataType}));
  tableau.makeConnector({
    getSchema: function(cb){ cb([{id:'eam',alias:'EAM',columns:cols}]); },
    getData: function(tb,cb){
      fetch('${apiBase}/reporting/tableau-wdc/${subjectId}/data?page=1&pageSize=1000')
        .then(r=>r.json()).then(j=>{
          var t=tb.getTable('eam'); t.appendRows(j.data.map(r=>cols.map(c=>r[c.id])));
          cb();
        });
    }
  });
  tableau.connectionName = 'EAM Report';
  tableau.submit();
});
</script></body></html>`;
}
