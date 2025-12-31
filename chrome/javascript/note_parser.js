// Parse note text to determine type and extract text content
// Pure function with no Chrome API dependencies

// Determine note type from text and extract clean note text
function getSpecialNoteTypeFromString(theString){
  var specialNote = 'note';

  if(theString==null){
    return {type: "note", text: ""};
  }

  var noteText = theString;

  var firstChar = noteText.substring(0, 1);

  switch(firstChar) {
    case '?':
      specialNote = 'question';
      noteText = noteText.substring(1);
      break;
    case '!':
      specialNote = 'bug';
      noteText = noteText.substring(1);
      break;
    case '-':
      specialNote = 'todo';
      noteText = noteText.substring(1);
      break;
    case '@':
      var words = noteText.split(" ");
      var specialConfig = words[0].substring(1);
      if(specialConfig.length>0){
        // Check if it ends with [] for closable custom types
        var isClosable = specialConfig.endsWith('[]');
        if(isClosable){
          specialConfig = specialConfig.slice(0, -2); // Remove []
        }
        // Truncate custom type names to 15 characters maximum
        specialConfig = specialConfig.substring(0, 15);

        // Check if it's actually a standard type name
        var standardTypes = ['note', 'question', 'todo', 'bug'];
        if(standardTypes.includes(specialConfig)){
          specialNote = specialConfig; // Treat as standard type
        } else {
          // It's a custom type
          specialNote = specialConfig;
          if(isClosable){
            specialNote += '[]'; // Add [] back for custom closable types
          }
        }
      }
      noteText = noteText.substring(words[0].length);
      break;
  }

  noteText = noteText.trim();

  return {type: specialNote, text: noteText};
}

// Export for module usage (ESM)
// This allows: import { getSpecialNoteTypeFromString } from './note_parser.js'
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSpecialNoteTypeFromString: getSpecialNoteTypeFromString
  };
}

// Export for ES6 modules
// This allows: import { getSpecialNoteTypeFromString } from './note_parser.js'
if (typeof window === 'undefined' && typeof exports !== 'undefined') {
  exports.getSpecialNoteTypeFromString = getSpecialNoteTypeFromString;
}
