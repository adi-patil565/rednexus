const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// The formatted dummy data with month and year added to monthlyCamps
const bloodBanksData = [
  {
    name: "MGM Hospital Blood Bank",
    username: "mgm_kamothe",
    password: "MgmBlood@2026",
    address: "Sector 1, Sion-Panvel Expressway, Kamothe, Navi Mumbai, 410209",
    dailyUsageUnits: 55,
    monthlyCamps: [
      { day: 5, month: 8, year: 2026, location: "MGM Campus, Kamothe" },
      { day: 14, month: 8, year: 2026, location: "Kharghar Station" },
      { day: 22, month: 8, year: 2026, location: "Little World Mall" }
    ],
    contact: {
      inCharge: "Dr. Anil Sharma",
      phone: "+91-9876500001",
      email: "anil.sharma@mgmblood.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 15, "B_pos": 22, "O_pos": 30, "AB_pos": 8, "Negatives": 5 },
      prbc: { "A_pos": 40, "B_pos": 45, "O_pos": 60, "AB_pos": 12, "Negatives": 8 },
      ffp: 85,
      platelets: 24
    }
  },
  {
    name: "Fortis Hiranandani Blood Bank",
    username: "fortis_vashi",
    password: "Fortis#Vashi123",
    address: "Mini Sea Shore Road, Sector 10A, Vashi, Navi Mumbai, 400703",
    dailyUsageUnits: 40,
    monthlyCamps: [
      { day: 2, month: 8, year: 2026, location: "Inorbit Mall, Vashi" },
      { day: 10, month: 8, year: 2026, location: "NMSA Club" },
      { day: 18, month: 8, year: 2026, location: "Mini Sea Shore Park" },
      { day: 28, month: 8, year: 2026, location: "Reliance Corporate Park" }
    ],
    contact: {
      inCharge: "Dr. Megha Patil",
      phone: "+91-9876500002",
      email: "m.patil@fortisbb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 10, "B_pos": 18, "O_pos": 25, "AB_pos": 5, "Negatives": 3 },
      prbc: { "A_pos": 35, "B_pos": 50, "O_pos": 55, "AB_pos": 15, "Negatives": 6 },
      ffp: 60,
      platelets: 18
    }
  },
  {
    name: "D.Y. Patil Hospital Blood Bank",
    username: "dypatil_nerul",
    password: "DyPatil@Nerul",
    address: "Sector 5, Nerul, Navi Mumbai, 400706",
    dailyUsageUnits: 65,
    monthlyCamps: [
      { day: 7, month: 8, year: 2026, location: "D.Y. Patil Stadium" },
      { day: 15, month: 8, year: 2026, location: "SIES College, Nerul" },
      { day: 25, month: 8, year: 2026, location: "Seawoods Grand Central Mall" }
    ],
    contact: {
      inCharge: "Dr. Rajesh Iyer",
      phone: "+91-9876500003",
      email: "rajesh.iyer@dypblood.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 25, "B_pos": 30, "O_pos": 45, "AB_pos": 10, "Negatives": 7 },
      prbc: { "A_pos": 60, "B_pos": 70, "O_pos": 85, "AB_pos": 20, "Negatives": 12 },
      ffp: 110,
      platelets: 40
    }
  },
  {
    name: "Apollo Hospitals Blood Bank",
    username: "apollo_belapur",
    password: "ApolloBel@2026",
    address: "Plot 13, Parsik Hill Road, Sector 23, CBD Belapur, Navi Mumbai, 400614",
    dailyUsageUnits: 50,
    monthlyCamps: [
      { day: 3, month: 8, year: 2026, location: "CIDCO Bhavan, Belapur" },
      { day: 12, month: 8, year: 2026, location: "Parsik Hill Society" },
      { day: 20, month: 8, year: 2026, location: "Uran City Center" },
      { day: 27, month: 8, year: 2026, location: "Belapur Station Complex" }
    ],
    contact: {
      inCharge: "Dr. Sneha Deshmukh",
      phone: "+91-9876500004",
      email: "s.deshmukh@apollobb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 12, "B_pos": 20, "O_pos": 28, "AB_pos": 6, "Negatives": 4 },
      prbc: { "A_pos": 45, "B_pos": 40, "O_pos": 50, "AB_pos": 18, "Negatives": 9 },
      ffp: 75,
      platelets: 22
    }
  },
  {
    name: "NMMC General Hospital Blood Bank",
    username: "nmmc_vashi",
    password: "NmmcGov#2026",
    address: "Sector 10, Vashi, Navi Mumbai, 400703",
    dailyUsageUnits: 80,
    monthlyCamps: [
      { day: 1, month: 8, year: 2026, location: "APMC Market, Vashi" },
      { day: 11, month: 8, year: 2026, location: "Koparkhairane Station" },
      { day: 21, month: 8, year: 2026, location: "Airoli Sector 8" },
      { day: 30, month: 8, year: 2026, location: "Vashi Bus Depot" }
    ],
    contact: {
      inCharge: "Dr. Prakash Kadam",
      phone: "+91-9876500005",
      email: "p.kadam@nmmcbb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 30, "B_pos": 45, "O_pos": 60, "AB_pos": 15, "Negatives": 10 },
      prbc: { "A_pos": 80, "B_pos": 95, "O_pos": 110, "AB_pos": 30, "Negatives": 15 },
      ffp: 150,
      platelets: 45
    }
  },
  {
    name: "Reliance Hospital Blood Bank",
    username: "reliance_kk",
    password: "RelCare@Kk",
    address: "Thane - Belapur Road, Sector 10, Koparkhairane, Navi Mumbai, 400709",
    dailyUsageUnits: 35,
    monthlyCamps: [
      { day: 8, month: 8, year: 2026, location: "Reliance Corporate IT Park" },
      { day: 17, month: 8, year: 2026, location: "Ghansoli D-Mart" },
      { day: 26, month: 8, year: 2026, location: "Mahape MIDC" }
    ],
    contact: {
      inCharge: "Dr. Vivek Singh",
      phone: "+91-9876500006",
      email: "vivek.singh@reliancebb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 8, "B_pos": 15, "O_pos": 20, "AB_pos": 4, "Negatives": 2 },
      prbc: { "A_pos": 25, "B_pos": 30, "O_pos": 40, "AB_pos": 10, "Negatives": 5 },
      ffp: 45,
      platelets: 15
    }
  },
  {
    name: "Terna Speciality Hospital Blood Bank",
    username: "terna_nerul",
    password: "TernaMed123",
    address: "Sector 12, Phase II, Nerul West, Navi Mumbai, 400706",
    dailyUsageUnits: 45,
    monthlyCamps: [
      { day: 4, month: 8, year: 2026, location: "Terna Engineering College" },
      { day: 13, month: 8, year: 2026, location: "Nerul Gymkhana" },
      { day: 23, month: 8, year: 2026, location: "Juinagar Station" },
      { day: 29, month: 8, year: 2026, location: "Sanpada Sector 5" }
    ],
    contact: {
      inCharge: "Dr. Anjali Joshi",
      phone: "+91-9876500007",
      email: "a.joshi@ternabb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 14, "B_pos": 18, "O_pos": 24, "AB_pos": 7, "Negatives": 4 },
      prbc: { "A_pos": 35, "B_pos": 42, "O_pos": 50, "AB_pos": 14, "Negatives": 7 },
      ffp: 65,
      platelets: 20
    }
  },
  {
    name: "Suyash Hospital Blood Bank",
    username: "suyash_seawoods",
    password: "Suyash@Sea26",
    address: "Sector 40, Seawoods West, Navi Mumbai, 400706",
    dailyUsageUnits: 20,
    monthlyCamps: [
      { day: 9, month: 8, year: 2026, location: "Seawoods Estate NRI Complex" },
      { day: 19, month: 8, year: 2026, location: "Don Bosco School Ground" },
      { day: 28, month: 8, year: 2026, location: "Karave Village" }
    ],
    contact: {
      inCharge: "Dr. Rohan Mehta",
      phone: "+91-9876500008",
      email: "rohan.m@suyashbb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 5, "B_pos": 10, "O_pos": 15, "AB_pos": 2, "Negatives": 1 },
      prbc: { "A_pos": 15, "B_pos": 20, "O_pos": 25, "AB_pos": 5, "Negatives": 3 },
      ffp: 30,
      platelets: 10
    }
  },
  {
    name: "PKC Hospital Blood Bank",
    username: "pkc_vashi",
    password: "PkcBlood2026",
    address: "Sector 11, Juhu Nagar, Vashi, Navi Mumbai, 400703",
    dailyUsageUnits: 25,
    monthlyCamps: [
      { day: 6, month: 8, year: 2026, location: "Vashi Plaza" },
      { day: 16, month: 8, year: 2026, location: "Father Agnel College" },
      { day: 24, month: 8, year: 2026, location: "Sector 17 Market" }
    ],
    contact: {
      inCharge: "Dr. Kavita Nair",
      phone: "+91-9876500009",
      email: "k.nair@pkcbb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 8, "B_pos": 12, "O_pos": 18, "AB_pos": 3, "Negatives": 2 },
      prbc: { "A_pos": 20, "B_pos": 25, "O_pos": 30, "AB_pos": 8, "Negatives": 4 },
      ffp: 40,
      platelets: 12
    }
  },
  {
    name: "Panvel Municipal Blood Bank",
    username: "pmc_panvel",
    password: "PmcGov@Panvel",
    address: "Near Panvel ST Stand, Old Panvel, Navi Mumbai, 410206",
    dailyUsageUnits: 50,
    monthlyCamps: [
      { day: 2, month: 8, year: 2026, location: "Panvel Railway Station" },
      { day: 10, month: 8, year: 2026, location: "Khandeshwar Sector 8" },
      { day: 18, month: 8, year: 2026, location: "Kalamboli Circle" },
      { day: 26, month: 8, year: 2026, location: "New Panvel Market" }
    ],
    contact: {
      inCharge: "Dr. Sameer Gokhale",
      phone: "+91-9876500010",
      email: "s.gokhale@pmcbb.dummy.in"
    },
    stock: {
      wholeBlood: { "A_pos": 20, "B_pos": 25, "O_pos": 35, "AB_pos": 8, "Negatives": 5 },
      prbc: { "A_pos": 45, "B_pos": 55, "O_pos": 65, "AB_pos": 15, "Negatives": 8 },
      ffp: 80,
      platelets: 25
    }
  }
];

// Function to upload data
async function uploadData() {
  const collectionRef = db.collection("blood_banks");
  let count = 0;

  for (const bank of bloodBanksData) {
    try {
      // Using username as the document ID for easier querying later
      await collectionRef.doc(bank.username).set(bank);
      console.log(`Successfully added: ${bank.name}`);
      count++;
    } catch (error) {
      console.error(`Error adding ${bank.name}: `, error);
    }
  }
  
  console.log(`\nFinished! Successfully added ${count} blood banks to Firestore.`);
}

uploadData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during seed:', err);
    process.exit(1);
  });