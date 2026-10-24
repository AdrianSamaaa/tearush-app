export interface Developer {
  name: string;
  role: string;
  photo: string;   // put the matching photo in src/assets/photos/developers/
  skills: string[];
  bio: string;
}

/**
 * TeaRush development team.
 * Drop each member's photo into src/assets/photos/developers/ using the
 * filename referenced below (jpg or png). If a photo is missing, the
 * Developers page automatically falls back to a placeholder avatar.
 */
export const DEVELOPERS: Developer[] = [
  {
    name: 'Carlos Miguel T. Morillo',
    role: 'Lead Developer',
    photo: 'assets/photos/developers/morillo.jpg',
    skills: ['Angular', 'Ionic Framework', 'Project Architecture', 'Git'],
    bio: 'Oversees the overall app architecture and coordinates the team, in addition to building core navigation and app logic.',
  },
  {
    name: 'James Cyrus Diaz',
    role: 'UI/UX Designer & Frontend Developer',
    photo: 'assets/photos/developers/diaz.jpg',
    skills: ['UI/UX Design', 'Figma', 'HTML/SCSS', 'Ionic Components'],
    bio: 'Designed the app\u2019s visual identity and look-and-feel, and implemented key interface components.',
  },
  {
    name: 'Noha Ravanes',
    role: 'Backend Developer / Database Manager',
    photo: 'assets/photos/developers/ravanes.jpg',
    skills: ['Firebase', 'Database Design', 'API Integration'],
    bio: 'Handles data storage, product/order data structures, and integration between the app and backend services.',
  },
  {
    name: 'Carl Osea',
    role: 'Quality Assurance & Documentation Lead',
    photo: 'assets/photos/developers/osea.jpg',
    skills: ['Manual Testing', 'Bug Tracking', 'Technical Documentation'],
    bio: 'Tests app features across devices, tracks issues, and maintains project documentation and user guides.',
  },
  {
    name: 'Adrian Joseph Porazo',
    role: 'Frontend Developer / Systems Analyst',
    photo: 'assets/photos/developers/porazo.jpg',
    skills: ['Angular', 'TypeScript', 'Requirements Analysis'],
    bio: 'Translates project requirements into app features and builds out supporting pages and components.',
  },
];

