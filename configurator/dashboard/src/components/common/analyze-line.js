import fs from 'fs';

const content = fs.readFileSync('ErrorMessage.tsx', 'utf8');
const lines = content.split('\n');
const line102 = lines[101]; // 0-indexed

console.log('Line 102:');
console.log(line102);
console.log('\nCharacter at column 11 (0-indexed 10):');
console.log(`"${line102[10]}"`);
console.log('\nSubstring from column 11:');
console.log(line102.substring(10));
console.log('\nFull line length:', line102.length);
