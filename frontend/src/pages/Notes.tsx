import React, { useEffect, useState } from 'react';
import { Box, Heading, Table, Thead, Tbody, Tr, Th, Td, IconButton, Text, Spinner, Alert, AlertIcon } from '@chakra-ui/react';
import { FaCopy, FaTrash, FaVolumeUp, FaPause, FaRedo } from 'react-icons/fa';
import { getNotes, deleteNote } from '../api/apiClient';
import { Select, Button, HStack } from '@chakra-ui/react';

function getReadTime(chars: number) {
  // Assume 200 chars/minute
  const mins = Math.floor(chars / 200);
  const secs = Math.round(((chars / 200) - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')} min`;
}

export default function Notes() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [hasMore, setHasMore] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    async function fetchNotes() {
      setLoading(true);
      setError('');
      try {
        const data = await getNotes({ page, page_size: pageSize });
        setNotes(data);
        setHasMore(data.length === pageSize);
      } catch (e: any) {
        setError(e.message || 'Failed to load notes');
      }
      setLoading(false);
    }
    fetchNotes();
  }, [page, pageSize]);

  // Stop playback when navigating away or unmounting
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Stop playback if a new note is played
  const handlePlayPause = (note: any) => {
    if (playingId === note.id) {
      window.speechSynthesis.pause();
      setPlayingId(null);
    } else {
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(note.content);
      u.onend = () => setPlayingId(null);
      window.speechSynthesis.speak(u);
      setUtterance(u);
      setPlayingId(note.id);
    }
  };

  const handleReplay = (note: any) => {
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(note.content);
    u.onend = () => setPlayingId(null);
    window.speechSynthesis.speak(u);
    setUtterance(u);
    setPlayingId(note.id);
  };

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
                <Th>Actions</Th>
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
                    <HStack spacing={1}>
                      <IconButton
                        aria-label={playingId === note.id ? 'Pause note' : 'Play note'}
                        icon={playingId === note.id ? <FaPause /> : <FaVolumeUp />}
                        colorScheme={playingId === note.id ? 'gray' : 'blue'}
                        size="sm"
                        onClick={() => handlePlayPause(note)}
                      />
                      <IconButton
                        aria-label="Replay note"
                        icon={<FaRedo />}
                        colorScheme="gray"
                        size="sm"
                        onClick={() => handleReplay(note)}
                      />
                      <IconButton
                        aria-label="Copy note"
                        icon={<FaCopy />}
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(note.content)}
                      />
                      <IconButton
                        aria-label="Delete note"
                        icon={<FaTrash />}
                        colorScheme="red"
                        size="sm"
                        onClick={() => handleDelete(note.id)}
                      />
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {notes.length === 0 && <Text mt={4}>No notes found.</Text>}
          {/* Pagination controls */}
          <HStack mt={4} justify="space-between">
            <HStack>
              <Button onClick={() => setPage(page - 1)} isDisabled={page === 1}>Previous</Button>
              <Text>Page {page}</Text>
              <Button onClick={() => setPage(page + 1)} isDisabled={!hasMore}>Next</Button>
            </HStack>
            <Select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} width="auto">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
          </HStack>
        </Box>
      )}
    </Box>
  );
} 