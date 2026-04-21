/**
 * Lista opiekunów klientów Verseo.
 * Customer Development + Customer Success Managers + CS Specialists.
 * Posortowani alfabetycznie po nazwisku.
 */
export const TEAM_MEMBERS = [
  'Mateusz Banaś',
  'Kamil Bargiel',
  'Jakub Białczyk',
  'Inez Białooka',
  'Paulina Błaszkowiak',
  'Krzysztof Borzymowski',
  'Witold Chęciński',
  'Szymon Chmielewski',
  'Dariusz Cichocki',
  'Pola Chojnacka',
  'Marek Cylka',
  'Jan Czujko',
  'Monika Dudek-Nowicka',
  'Miłosz Fraszczyk',
  'Paweł Grabowski',
  'Joanna Gregorczyk',
  'Joanna Hałaszkiewicz',
  'Zofia Hemmerling',
  'Barbara Jakubowska',
  'Filip Jurków',
  'Marika Kachaniak',
  'Natalia Kasprzak',
  'Marcin Komar',
  'Dominik Kowalewski',
  'Paweł Królski',
  'Wiktor Ławicki',
  'Julia Masłowska',
  'Jakub Mikołajski',
  'Katarzyna Nowakowska',
  'Szymon Nyga',
  'Marek Pankowski',
  'Bartosz Polak',
  'Angelika Siemiątkowska',
  'Marta Starczewska',
  'Jędrzej Swarcewicz',
  'Mikołaj Świderski',
  'Nikodem Szarata',
  'Agnieszka Szymańska',
  'Hubert Wendzinski',
]

// Deduplikacja na wypadek duplikatów
export const TEAM_MEMBERS_UNIQUE = [...new Set(TEAM_MEMBERS)]

export const CAMPAIGN_GOALS = [
  'Awareness (Świadomość marki)',
  'Consideration (Ruch / Zaangażowanie)',
  'Conversion (Sprzedaż)',
  'Retargeting',
]
