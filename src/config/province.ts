/**
 * Nomi delle province usate dall'OMI (province catastali: per esempio Monza e Brianza è compresa
 * in Milano, Fermo in Ascoli Piceno, Barletta-Andria-Trani tra Bari e Foggia).
 */
export const PROVINCE: Record<string, string> = {
  AG: 'Agrigento', AL: 'Alessandria', AN: 'Ancona', AO: 'Aosta', AP: 'Ascoli Piceno', AQ: "L'Aquila",
  AR: 'Arezzo', AT: 'Asti', AV: 'Avellino', BA: 'Bari', BG: 'Bergamo', BI: 'Biella', BL: 'Belluno',
  BN: 'Benevento', BO: 'Bologna', BR: 'Brindisi', BS: 'Brescia', BZ: 'Bolzano', CA: 'Cagliari',
  CB: 'Campobasso', CE: 'Caserta', CH: 'Chieti', CL: 'Caltanissetta', CN: 'Cuneo', CO: 'Como',
  CR: 'Cremona', CS: 'Cosenza', CT: 'Catania', CZ: 'Catanzaro', EN: 'Enna', FE: 'Ferrara', FG: 'Foggia',
  FI: 'Firenze', FO: 'Forlì-Cesena', FR: 'Frosinone', GE: 'Genova', GO: 'Gorizia', GR: 'Grosseto',
  IM: 'Imperia', IS: 'Isernia', KR: 'Crotone', LC: 'Lecco', LE: 'Lecce', LI: 'Livorno', LO: 'Lodi',
  LT: 'Latina', LU: 'Lucca', MC: 'Macerata', ME: 'Messina', MI: 'Milano', MN: 'Mantova', MO: 'Modena',
  MS: 'Massa-Carrara', MT: 'Matera', NA: 'Napoli', NO: 'Novara', NU: 'Nuoro', OR: 'Oristano',
  PA: 'Palermo', PC: 'Piacenza', PD: 'Padova', PE: 'Pescara', PG: 'Perugia', PI: 'Pisa', PN: 'Pordenone',
  PO: 'Prato', PR: 'Parma', PS: 'Pesaro e Urbino', PT: 'Pistoia', PV: 'Pavia', PZ: 'Potenza',
  RA: 'Ravenna', RC: 'Reggio Calabria', RE: 'Reggio Emilia', RG: 'Ragusa', RI: 'Rieti', RM: 'Roma',
  RN: 'Rimini', RO: 'Rovigo', SA: 'Salerno', SI: 'Siena', SO: 'Sondrio', SP: 'La Spezia', SR: 'Siracusa',
  SS: 'Sassari', SV: 'Savona', TA: 'Taranto', TE: 'Teramo', TN: 'Trento', TO: 'Torino', TP: 'Trapani',
  TR: 'Terni', TS: 'Trieste', TV: 'Treviso', UD: 'Udine', VA: 'Varese', VB: 'Verbano-Cusio-Ossola',
  VC: 'Vercelli', VE: 'Venezia', VI: 'Vicenza', VR: 'Verona', VT: 'Viterbo', VV: 'Vibo Valentia',
};

/** Fasce OMI della zona. */
export const FASCE: Record<string, string> = {
  B: 'Centrale',
  C: 'Semicentrale',
  D: 'Periferica',
  E: 'Suburbana',
  R: 'Extraurbana',
};
