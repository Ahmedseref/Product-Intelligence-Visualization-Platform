export function backupLabel(key: string): string {
  const labels: Record<string, string> = {
    treeNodes: 'Taxonomy nodes', suppliers: 'Contacts / suppliers', products: 'Products',
    appSettings: 'App settings, synced notes & saved views', masterProducts: 'Master products',
    supplierProducts: 'Supplier products', customFieldDefinitions: 'Custom fields',
    proformas: 'Invoices', proformaItems: 'Invoice line items', proformaFinancials: 'Invoice financials',
    proformaSettings: 'Invoice settings', systemLayers: 'System layers',
    systemProductOptions: 'System product options', productQualificationTags: 'Product qualification tags',
  };
  return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
}
