import React, { useEffect, useState } from 'react';
import { Box, Heading, Table, Thead, Tbody, Tr, Th, Td, IconButton, Text, Spinner, Alert, AlertIcon } from '@chakra-ui/react';
import { FaCopy, FaTrash, FaVolumeUp } from 'react-icons/fa';
import { getNotes, deleteNote } from '../api/apiClient';

function getReadTime(chars: number) {
  // Assume 200 chars/minute
  const mins = Math.floor(chars / 200);
  const secs = Math.round(((chars / 200) - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function Notes() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchNotes() {
      setLoading(true);
      setError('');
      try {
        const data = await getNotes();
        setNotes(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load notes');
      }
      setLoading(false);
    }
    fetchNotes();
  }, []);

  function getDisplayDomain(domain: string) {
    if (domain === 'mhjfbmdgcfjbbpaeojofohoefgiehjai' || domain === 'local-file') {
      return 'Downloaded/Local file';
    }
    return domain;
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteNote(id);
      setNotes(notes.filter(n => n.id !== id));
    } catch (e: any) {
      alert(e.message || 'Failed to delete note');
    }
  };

  return (
    <Box>
      <Heading size="lg" mb={6}>Notes</Heading>
      {loading && <Spinner size="lg" />}
      {error && <Alert status="error" mb={4}><AlertIcon />{error}</Alert>}
      {!loading && !error && (
        <Box bg="white" borderRadius="md" boxShadow="sm" p={6}>
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>Domain</Th>
                <Th>Site</Th>
                <Th>Length</Th>
                <Th>Read Time</Th>
                <Th>Listen</Th>
                <Th>Copy</Th>
                <Th>Delete</Th>
              </Tr>
            </Thead>
            <Tbody>
              {notes.map(note => (
                <Tr key={note.id}>
                  <Td>{getDisplayDomain(note.domain)}</Td>
                  <Td>{note.source_title}</Td>
                  <Td>{note.content.length}</Td>
                  <Td>{getReadTime(note.content.length)}</Td>
                  <Td>
                    <IconButton
                      aria-label="Play note"
                      icon={<FaVolumeUp />}
                      colorScheme="blue"
                      onClick={() => window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(note.content))}
                    />
                  </Td>
                  <Td>
                    <IconButton
                      aria-label="Copy note"
                      icon={<FaCopy />}
                      onClick={() => navigator.clipboard.writeText(note.content)}
                    />
                  </Td>
                  <Td>
                    <IconButton
                      aria-label="Delete note"
                      icon={<FaTrash />}
                      colorScheme="red"
                      onClick={() => handleDelete(note.id)}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {notes.length === 0 && <Text mt={4}>No notes found.</Text>}
        </Box>
      )}
    </Box>
  );
} 