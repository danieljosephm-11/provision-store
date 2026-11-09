/** GST state codes (India). Used for place of supply and CGST/SGST vs IGST. */
export const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

export const stateName = (code: string | null | undefined): string =>
  GST_STATES.find((s) => s.code === code)?.name ?? '';

/** GST slabs commonly used in Indian retail; rates are configurable per store. */
export const DEFAULT_GST_SLABS = [0, 5, 12, 18, 28];

export const DEFAULT_UNITS = [
  { name: 'Kilogram', code: 'KG', allowsDecimal: true },
  { name: 'Gram', code: 'GM', allowsDecimal: true },
  { name: 'Litre', code: 'LTR', allowsDecimal: true },
  { name: 'Millilitre', code: 'ML', allowsDecimal: true },
  { name: 'Piece', code: 'PCS', allowsDecimal: false },
  { name: 'Packet', code: 'PKT', allowsDecimal: false },
  { name: 'Box', code: 'BOX', allowsDecimal: false },
  { name: 'Dozen', code: 'DZN', allowsDecimal: false },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity',
  'Salary',
  'Transportation',
  'Packaging',
  'Maintenance',
  'Miscellaneous',
];

export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Fruits & Vegetables',
  'Dairy & Bakery',
  'Beverages',
  'Snacks',
  'Personal Care',
  'Household',
  'Stationery',
];
