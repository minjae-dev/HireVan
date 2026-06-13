export const getCategories = (t: (key: string) => string) => [
  { value: '식당', label: t('options.category.restaurant') },
  { value: '카페', label: t('options.category.cafe') },
  { value: 'office-accounting', label: t('options.category.office_accounting') },
  { value: 'sales-consultation', label: t('options.category.sales_consultation') },
  { value: 'retail-dealership', label: t('options.category.retail_dealership') },
  { value: 'shipping-logistics', label: t('options.category.shipping_logistics') },
  { value: 'production-tech', label: t('options.category.production_tech') },
  { value: 'construction', label: t('options.category.construction') },
  { value: 'care-cleaning', label: t('options.category.care_cleaning') },
  { value: 'it-design', label: t('options.category.it_design') },
  { value: 'beauty-ceremony', label: t('options.category.beauty_ceremony') },
  { value: 'healthcare', label: t('options.category.healthcare') },
  { value: 'teaching-lecturer', label: t('options.category.teaching_lecturer') },
  { value: 'etc', label: t('options.category.etc') },
]

export const getLocations = (t: (key: string) => string) => [
  { value: '5', label: t('options.location.vancouver') },
  { value: '1', label: t('options.location.burnaby') },
  { value: '2', label: t('options.location.coquitlam') },
  { value: '4', label: t('options.location.surrey') },
  { value: '11', label: t('options.location.langley') },
  { value: '14', label: t('options.location.port_coquitlam') },
  { value: '6', label: t('options.location.north_vancouver') },
  { value: '7', label: t('options.location.west_vancouver') },
  { value: '3', label: t('options.location.port_moody') },
  { value: '9', label: t('options.location.richmond') },
  { value: '12', label: t('options.location.delta') },
  { value: '15', label: t('options.location.new_westminster') },
  { value: '8', label: t('options.location.maple_ridge') },
  { value: '10', label: t('options.location.white_rock') },
  { value: '16', label: t('options.location.pitt_meadows') },
  { value: '17', label: t('options.location.jasper') },
  { value: '19', label: t('options.location.abbotsford') },
  { value: '20', label: t('options.location.kelowna') },
  { value: '13', label: t('options.location.etc') },
]

export const getVisaOptions = (t: (key: string) => string) => [
  { value: 'working_holiday', label: t('options.visa.working_holiday') },
  { value: 'student', label: t('options.visa.student') },
  { value: 'work_permit', label: t('options.visa.work_permit') },
  { value: 'pr_citizen', label: t('options.visa.pr_citizen') },
  { value: 'etc', label: t('options.visa.etc') },
]

export const getShiftOptions = (t: (key: string) => string) => [
  { value: 'weekday_morning', label: t('options.shift.weekday_morning') },
  { value: 'weekday_afternoon', label: t('options.shift.weekday_afternoon') },
  { value: 'weekday_evening', label: t('options.shift.weekday_evening') },
  { value: 'closing', label: t('options.shift.closing') },
  { value: 'dawn', label: t('options.shift.dawn') },
  { value: 'weekend_morning', label: t('options.shift.weekend_morning') },
  { value: 'weekend_afternoon', label: t('options.shift.weekend_afternoon') },
  { value: 'weekend_full', label: t('options.shift.weekend_full') },
  { value: 'fulltime', label: t('options.shift.fulltime') },
  { value: 'parttime', label: t('options.shift.parttime') },
]

export const getSkillOptions = (t: (key: string) => string) => [
  { value: 'pos', label: t('options.skill.pos') },
  { value: 'cashier', label: t('options.skill.cashier') },
  { value: 'korean_typing', label: t('options.skill.korean_typing') },
  { value: 'serving', label: t('options.skill.serving') },
  { value: 'kitchen_assist', label: t('options.skill.kitchen_assist') },
  { value: 'packaging', label: t('options.skill.packaging') },
  { value: 'parking', label: t('options.skill.parking') },
  { value: 'delivery', label: t('options.skill.delivery') },
  { value: 'cleaning', label: t('options.skill.cleaning') },
  { value: 'nail', label: t('options.skill.nail') },
]
