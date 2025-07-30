import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Heading, 
  Table, 
  Thead, 
  Tbody, 
  Tr, 
  Th, 
  Td, 
  IconButton, 
  Text, 
  Spinner, 
  Alert, 
  AlertIcon,
  Button,
  HStack,
  Badge,
  useDisclosure
} from '@chakra-ui/react';
import { FaEye, FaTrash, FaFileAlt, FaCopy } from 'react-icons/fa';
import { getNotes, deleteNote, generateSummary } from '../api/apiClient';
import { Select } from '@chakra-ui/react';
import NoteModal from '../components/NoteModal';

export default function Notes() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [hasMore, setHasMore] = useState(false);
  const [generatingSummaries, setGeneratingSummaries] = useState<Set<string>>(new Set());
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const { isOpen, onOpen, onClose } = useDisclosure();

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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteNote(id);
      setNotes(notes.filter(n => n.id !== id));
    } catch (e: any) {
      alert(e.message || 'Failed to delete note');
    }
  };

  const handleGenerateSummary = async (noteId: string) => {
    setGeneratingSummaries(prev => new Set(prev).add(noteId));
    try {
      const data = await generateSummary(noteId);
      // Check if summary is unavailable - don't save it to the note
      if (data.summary !== "unavailable") {
        setNotes(notes.map(note => 
          note.id === noteId 
            ? { ...note, summary: data.summary }
            : note
        ));
      } else {
        // Show alert for unavailable summary
        alert('Summary unavailable - text may be too short or incomplete for summarization.');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to generate summary');
    } finally {
      setGeneratingSummaries(prev => {
        const newSet = new Set(prev);
        newSet.delete(noteId);
        return newSet;
      });
    }
  };

  const handleViewNote = (noteId: string) => {
    setSelectedNoteId(noteId);
    onOpen();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  function getDisplayDomain(domain: string) {
    if (domain === 'mhjfbmdgcfjbbpaeojofohoefgiehjai' || domain === 'local-file') {
      return 'Downloaded/Local file';
    }
    return domain;
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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
                <Th>Note Preview</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {notes.map(note => (
                <Tr key={note.id}>
                  <Td>
                    <Badge colorScheme="blue">
                      {getDisplayDomain(note.domain || 'Unknown')}
                    </Badge>
                  </Td>
                  <Td>
                    <Text fontSize="sm">
                      {truncateText(note.content, 50)}
                    </Text>
                  </Td>
                  <Td>
                    <HStack spacing={1}>
                      <IconButton
                        aria-label="View note"
                        icon={<FaEye />}
                        colorScheme="blue"
                        size="sm"
                        onClick={() => handleViewNote(note.id)}
                      />
                      <IconButton
                        aria-label="Copy note"
                        icon={<FaCopy />}
                        size="sm"
                        onClick={() => handleCopy(note.content)}
                      />
                      {!note.summary && (
                        <IconButton
                          aria-label="Generate summary"
                          icon={<FaFileAlt />}
                          colorScheme="green"
                          size="sm"
                          isLoading={generatingSummaries.has(note.id)}
                          onClick={() => handleGenerateSummary(note.id)}
                        />
                      )}
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

      {/* Note Modal */}
      <NoteModal 
        isOpen={isOpen} 
        onClose={onClose} 
        noteId={selectedNoteId} 
      />
    </Box>
  );
} 